# CMake build script for the libgit2 project
#
# Building (out of source build):
# > mkdir build && cd build
# > cmake .. [-DSETTINGS=VALUE]
# > cmake --build .
#
# Testing:
# > ctest -V
#
# Install:
# > cmake --build . --target install

PROJECT(libgit2 C)
CMAKE_MINIMUM_REQUIRED(VERSION 2.8)
CMAKE_POLICY(SET CMP0015 NEW)

# Add find modules to the path
SET(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CMAKE_CURRENT_SOURCE_DIR}/cmake/Modules/")

INCLUDE(CheckLibraryExists)
INCLUDE(CheckFunctionExists)
INCLUDE(AddCFlagIfSupported)
INCLUDE(FindPkgConfig)

# Build options
#
OPTION( SONAME				"Set the (SO)VERSION of the target"		ON  )
OPTION( BUILD_SHARED_LIBS	"Build Shared Library (OFF for Static)"	ON  )
OPTION( THREADSAFE			"Build libgit2 as threadsafe"			ON )
OPTION( BUILD_CLAR			"Build Tests using the Clar suite"		ON  )
OPTION( BUILD_EXAMPLES		"Build library usage example apps"		OFF )
OPTION( TAGS				"Generate tags"							OFF )
OPTION( PROFILE				"Generate profiling information"		OFF )
OPTION( ENABLE_TRACE		"Enables tracing support"				OFF )
OPTION( LIBGIT2_FILENAME	"Name of the produced binary"			OFF )

OPTION( USE_ICONV			"Link with and use iconv library" 		OFF )
OPTION( USE_SSH				"Link with libssh to enable SSH support" ON )
OPTION( USE_GSSAPI			"Link with libgssapi for SPNEGO auth"   OFF )
OPTION( VALGRIND			"Configure build for valgrind"			OFF )
OPTION( CURL			"User curl for HTTP if available" ON)

IF(${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
	SET( USE_ICONV ON )
	FIND_PACKAGE(Security)
	FIND_PACKAGE(CoreFoundation REQUIRED)
ENDIF()

IF(MSVC)
	# This option is only available when building with MSVC. By default, libgit2
	# is build using the cdecl calling convention, which is useful if you're
	# writing C. However, the CLR and Win32 API both expect stdcall.
	#
	# If you are writing a CLR program and want to link to libgit2, you'll want
	# to turn this on by invoking CMake with the "-DSTDCALL=ON" argument.
	OPTION( STDCALL			"Build libgit2 with the __stdcall convention"	OFF  )

	# This option must match the settings used in your program, in particular if you
	# are linking statically
	OPTION( STATIC_CRT		"Link the static CRT libraries"	ON  )

	ADD_DEFINITIONS(-D_SCL_SECURE_NO_WARNINGS)
	ADD_DEFINITIONS(-D_CRT_SECURE_NO_DEPRECATE)
	ADD_DEFINITIONS(-D_CRT_NONSTDC_NO_DEPRECATE)
ENDIF()


IF(WIN32)
	# By default, libgit2 is built with WinHTTP.  To use the built-in
	# HTTP transport, invoke CMake with the "-DWINHTTP=OFF" argument.
	OPTION(	WINHTTP			"Use Win32 WinHTTP routines"	ON	)
ENDIF()

IF(MSVC)
	# Enable MSVC CRTDBG memory leak reporting when in debug mode.
	OPTION(MSVC_CRTDBG "Enable CRTDBG memory leak reporting" OFF)
ENDIF()

IF (NOT ${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
	OPTION( USE_OPENSSL                     "Link with and use openssl library"             ON )
ENDIF()

# This variable will contain the libraries we need to put into
# libgit2.pc's Requires.private. That is, what we're linking to or
# what someone who's statically linking us needs to link to.
SET(LIBGIT2_PC_REQUIRES "")
# This will be set later if we use the system's http-parser library or
# use iconv (OSX) and will be written to the Libs.private field in the
# pc file.
SET(LIBGIT2_PC_LIBS "")

# Installation paths
#
SET(BIN_INSTALL_DIR bin CACHE PATH "Where to install binaries to.")
SET(LIB_INSTALL_DIR lib CACHE PATH "Where to install libraries to.")
SET(INCLUDE_INSTALL_DIR include CACHE PATH "Where to install headers to.")

# Set a couple variables to be substituted inside the .pc file.
# We can't just use LIB_INSTALL_DIR in the .pc file, as passing them as absolue
# or relative paths is both valid and supported by cmake.
SET (PKGCONFIG_PREFIX ${CMAKE_INSTALL_PREFIX})

IF(IS_ABSOLUTE ${LIB_INSTALL_DIR})
  SET (PKGCONFIG_LIBDIR ${LIB_INSTALL_DIR})
ELSE(IS_ABSOLUTE ${LIB_INSTALL_DIR})
  SET (PKGCONFIG_LIBDIR "\${prefix}/${LIB_INSTALL_DIR}")
ENDIF (IS_ABSOLUTE ${LIB_INSTALL_DIR})

IF(IS_ABSOLUTE ${INCLUDE_INSTALL_DIR})
  SET (PKGCONFIG_INCLUDEDIR ${INCLUDE_INSTALL_DIR})
ELSE(IS_ABSOLUTE ${INCLUDE_INSTALL_DIR})
  SET (PKGCONFIG_INCLUDEDIR "\${prefix}/${INCLUDE_INSTALL_DIR}")
ENDIF(IS_ABSOLUTE ${INCLUDE_INSTALL_DIR})

FUNCTION(TARGET_OS_LIBRARIES target)
	IF(WIN32)
		TARGET_LINK_LIBRARIES(${target} ws2_32)
	ELSEIF(CMAKE_SYSTEM_NAME MATCHES "(Solaris|SunOS)")
		TARGET_LINK_LIBRARIES(${target} socket nsl)
		LIST(APPEND LIBGIT2_PC_LIBS "-lsocket" "-lnsl")
		SET(LIBGIT2_PC_LIBS ${LIBGIT2_PC_LIBS} PARENT_SCOPE)
	ENDIF()
	CHECK_LIBRARY_EXISTS(rt clock_gettime "time.h" NEED_LIBRT)
	IF(NEED_LIBRT)
		TARGET_LINK_LIBRARIES(${target} rt)
		LIST(APPEND LIBGIT2_PC_LIBS "-lrt")
		SET(LIBGIT2_PC_LIBS ${LIBGIT2_PC_LIBS} PARENT_SCOPE)
	ENDIF()

	IF(THREADSAFE)
		TARGET_LINK_LIBRARIES(${target} ${CMAKE_THREAD_LIBS_INIT})
	ENDIF()
ENDFUNCTION()

# For the MSVC IDE, this function splits up the source files like windows
# explorer does. This is esp. useful with the libgit2_clar project, were
# usually 2 or more files share the same name.  Sadly, this file grouping
# is a per-directory option in cmake and not per-target, resulting in
# empty virtual folders "tests" for the git2.dll
FUNCTION(MSVC_SPLIT_SOURCES target)
	IF(MSVC_IDE)
		GET_TARGET_PROPERTY(sources ${target} SOURCES)
		FOREACH(source ${sources})
			IF(source MATCHES ".*/")
				STRING(REPLACE ${CMAKE_CURRENT_SOURCE_DIR}/ "" rel ${source})
				IF(rel)
					STRING(REGEX REPLACE "/([^/]*)$" "" rel ${rel})
					IF(rel)
						STRING(REPLACE "/" "\\\\" rel ${rel})
						SOURCE_GROUP(${rel} FILES ${source})
					ENDIF()
				ENDIF()
			ENDIF()
		ENDFOREACH()
	ENDIF()
ENDFUNCTION()

FILE(STRINGS "include/git2/version.h" GIT2_HEADER REGEX "^#define LIBGIT2_VERSION \"[^\"]*\"$")

STRING(REGEX REPLACE "^.*LIBGIT2_VERSION \"([0-9]+).*$" "\\1" LIBGIT2_VERSION_MAJOR "${GIT2_HEADER}")
STRING(REGEX REPLACE "^.*LIBGIT2_VERSION \"[0-9]+\\.([0-9]+).*$" "\\1" LIBGIT2_VERSION_MINOR  "${GIT2_HEADER}")
STRING(REGEX REPLACE "^.*LIBGIT2_VERSION \"[0-9]+\\.[0-9]+\\.([0-9]+).*$" "\\1" LIBGIT2_VERSION_REV "${GIT2_HEADER}")
SET(LIBGIT2_VERSION_STRING "${LIBGIT2_VERSION_MAJOR}.${LIBGIT2_VERSION_MINOR}.${LIBGIT2_VERSION_REV}")

FILE(STRINGS "include/git2/version.h" GIT2_HEADER_SOVERSION REGEX "^#define LIBGIT2_SOVERSION [0-9]+$")
STRING(REGEX REPLACE "^.*LIBGIT2_SOVERSION ([0-9]+)$" "\\1" LIBGIT2_SOVERSION "${GIT2_HEADER_SOVERSION}")

# Find required dependencies
INCLUDE_DIRECTORIES(src include)

IF (SECURITY_FOUND)
  # OS X 10.7 and older do not have some functions we use, fall back to OpenSSL there
  CHECK_LIBRARY_EXISTS("${SECURITY_DIRS}" SSLCreateContext "Security/SecureTransport.h" HAVE_NEWER_SECURITY)
  IF (HAVE_NEWER_SECURITY)
    MESSAGE("-- Found Security ${SECURITY_DIRS}")
    LIST(APPEND LIBGIT2_PC_LIBS "-framework Security")
  ELSE()
    MESSAGE("-- Security framework is too old, falling back to OpenSSL")
    SET(SECURITY_FOUND "NO")
    SET(SECURITY_DIRS "")
    SET(SECURITY_DIR "")
    SET(USE_OPENSSL "ON")
  ENDIF()
ENDIF()

IF (COREFOUNDATION_FOUND)
  MESSAGE("-- Found CoreFoundation ${COREFOUNDATION_DIRS}")
  LIST(APPEND LIBGIT2_PC_LIBS "-framework CoreFoundation")
ENDIF()


IF (WIN32 AND WINHTTP)
	ADD_DEFINITIONS(-DGIT_WINHTTP)
	INCLUDE_DIRECTORIES(deps/http-parser)
	FILE(GLOB SRC_HTTP deps/http-parser/*.c deps/http-parser/*.h)

	# Since MinGW does not come with headers or an import library for winhttp,
	# we have to include a private header and generate our own import library
	IF (MINGW)
		FIND_PROGRAM(DLLTOOL dlltool CMAKE_FIND_ROOT_PATH_BOTH)
		IF (NOT DLLTOOL)
			MESSAGE(FATAL_ERROR "Could not find dlltool command")
		ENDIF ()

		SET(LIBWINHTTP_PATH "${CMAKE_CURRENT_BINARY_DIR}/deps/winhttp")
		FILE(MAKE_DIRECTORY ${LIBWINHTTP_PATH})

		IF ("${CMAKE_SIZEOF_VOID_P}" EQUAL "8")
			set(WINHTTP_DEF "${CMAKE_CURRENT_SOURCE_DIR}/deps/winhttp/winhttp64.def")
		ELSE()
			set(WINHTTP_DEF "${CMAKE_CURRENT_SOURCE_DIR}/deps/winhttp/winhttp.def")
		ENDIF()

		ADD_CUSTOM_COMMAND(
			OUTPUT ${LIBWINHTTP_PATH}/libwinhttp.a
			COMMAND ${DLLTOOL} -d ${WINHTTP_DEF} -k -D winhttp.dll -l libwinhttp.a
			DEPENDS ${WINHTTP_DEF}
			WORKING_DIRECTORY ${LIBWINHTTP_PATH}
		)

		SET_SOURCE_FILES_PROPERTIES(
			${CMAKE_CURRENT_SOURCE_DIR}/src/transports/winhttp.c
			PROPERTIES OBJECT_DEPENDS ${LIBWINHTTP_PATH}/libwinhttp.a
		)

		INCLUDE_DIRECTORIES(deps/winhttp)
		LINK_DIRECTORIES(${LIBWINHTTP_PATH})
	ENDIF ()

	LINK_LIBRARIES(winhttp rpcrt4 crypt32)
ELSE ()
	IF (CURL)
		PKG_CHECK_MODULES(CURL libcurl)
	ENDIF ()

	IF (NOT AMIGA AND USE_OPENSSL)
		FIND_PACKAGE(OpenSSL)
	ENDIF ()

	IF (CURL_FOUND)
		ADD_DEFINITIONS(-DGIT_CURL)
		INCLUDE_DIRECTORIES(${CURL_INCLUDE_DIRS})
		LINK_LIBRARIES(${CURL_LIBRARIES})
		LIST(APPEND LIBGIT2_PC_LIBS ${CURL_LDFLAGS})
	ENDIF()

	FIND_PACKAGE(HTTP_Parser)
	IF (HTTP_PARSER_FOUND AND HTTP_PARSER_VERSION_MAJOR EQUAL 2)
		INCLUDE_DIRECTORIES(${HTTP_PARSER_INCLUDE_DIRS})
		LINK_LIBRARIES(${HTTP_PARSER_LIBRARIES})
		LIST(APPEND LIBGIT2_PC_LIBS "-lhttp_parser")
	ELSE()
		MESSAGE(STATUS "http-parser was not found or is too old; using bundled 3rd-party sources.")
		INCLUDE_DIRECTORIES(deps/http-parser)
		FILE(GLOB SRC_HTTP deps/http-parser/*.c deps/http-parser/*.h)
	ENDIF()
ENDIF()

# Specify sha1 implementation
IF (WIN32 AND NOT MINGW AND NOT SHA1_TYPE STREQUAL "builtin")
	ADD_DEFINITIONS(-DWIN32_SHA1)
	FILE(GLOB SRC_SHA1 src/hash/hash_win32.c)
ELSEIF (${CMAKE_SYSTEM_NAME} MATCHES "Darwin")
	ADD_DEFINITIONS(-DGIT_COMMON_CRYPTO)
ELSEIF (OPENSSL_FOUND AND NOT SHA1_TYPE STREQUAL "builtin")
	ADD_DEFINITIONS(-DOPENSSL_SHA1)
	IF (CMAKE_SYSTEM_NAME MATCHES "FreeBSD")
		LIST(APPEND LIBGIT2_PC_LIBS "-lssl")
	ELSE()
		SET(LIBGIT2_PC_REQUIRES "${LIBGIT2_PC_REQUIRES} openssl")
	ENDIF ()
ELSE()
	FILE(GLOB SRC_SHA1 src/hash/hash_generic.c)
ENDIF()

# Enable tracing
IF (ENABLE_TRACE STREQUAL "ON")
	ADD_DEFINITIONS(-DGIT_TRACE)
ENDIF()

# Include POSIX regex when it is required
IF(WIN32 OR AMIGA OR CMAKE_SYSTEM_NAME MATCHES "(Solaris|SunOS)")
	INCLUDE_DIRECTORIES(deps/regex)
	SET(SRC_REGEX deps/regex/regex.c)
ENDIF()

# Optional external dependency: zlib
FIND_PACKAGE(ZLIB)
IF (ZLIB_FOUND)
	INCLUDE_DIRECTORIES(${ZLIB_INCLUDE_DIRS})
	LINK_LIBRARIES(${ZLIB_LIBRARIES})
	IF(APPLE OR CMAKE_SYSTEM_NAME MATCHES "FreeBSD")
		LIST(APPEND LIBGIT2_PC_LIBS "-lz")
	ELSE()
		SET(LIBGIT2_PC_REQUIRES "${LIBGIT2_PC_REQUIRES} zlib")
	ENDIF()
ELSE()
	MESSAGE(STATUS "zlib was not found; using bundled 3rd-party sources." )
	INCLUDE_DIRECTORIES(deps/zlib)
	ADD_DEFINITIONS(-DNO_VIZ -DSTDC -DNO_GZIP)
	FILE(GLOB SRC_ZLIB deps/zlib/*.c deps/zlib/*.h)
ENDIF()

# Optional external dependency: libssh2
IF (USE_SSH)
	PKG_CHECK_MODULES(LIBSSH2 libssh2)
ENDIF()
IF (LIBSSH2_FOUND)
	ADD_DEFINITIONS(-DGIT_SSH)
	INCLUDE_DIRECTORIES(${LIBSSH2_INCLUDE_DIRS})
	LINK_DIRECTORIES(${LIBSSH2_LIBRARY_DIRS})
	LIST(APPEND LIBGIT2_PC_LIBS ${LIBSSH2_LDFLAGS})
	#SET(LIBGIT2_PC_LIBS "${LIBGIT2_PC_LIBS} ${LIBSSH2_LDFLAGS}")
	SET(SSH_LIBRARIES ${LIBSSH2_LIBRARIES})

	CHECK_LIBRARY_EXISTS("${LIBSSH2_LIBRARIES}" libssh2_userauth_publickey_frommemory "${LIBSSH2_LIBRARY_DIRS}" HAVE_LIBSSH2_MEMORY_CREDENTIALS)
	IF (HAVE_LIBSSH2_MEMORY_CREDENTIALS)
		ADD_DEFINITIONS(-DGIT_SSH_MEMORY_CREDENTIALS)
	ENDIF()
ELSE()
	MESSAGE(STATUS "LIBSSH2 not found. Set CMAKE_PREFIX_PATH if it is installed outside of the default search path.")
ENDIF()

# Optional external dependency: libgssapi
IF (USE_GSSAPI)
	FIND_PACKAGE(GSSAPI)
ENDIF()
IF (GSSAPI_FOUND)
	ADD_DEFINITIONS(-DGIT_GSSAPI)
ENDIF()

# Optional external dependency: iconv
IF (USE_ICONV)
	FIND_PACKAGE(Iconv)
ENDIF()
IF (ICONV_FOUND)
	ADD_DEFINITIONS(-DGIT_USE_ICONV)
	INCLUDE_DIRECTORIES(${ICONV_INCLUDE_DIR})
	LIST(APPEND LIBGIT2_PC_LIBS ${ICONV_LIBRARIES})
ENDIF()

# Platform specific compilation flags
IF (MSVC)

	STRING(REPLACE "/Zm1000" " " CMAKE_C_FLAGS "${CMAKE_C_FLAGS}")

	# /GF - String pooling
	# /MP - Parallel build
	SET(CMAKE_C_FLAGS "/GF /MP /nologo ${CMAKE_C_FLAGS}")

	IF (STDCALL)
		# /Gz - stdcall calling convention
		SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} /Gz")
	ENDIF ()

	IF (STATIC_CRT)
		SET(CRT_FLAG_DEBUG "/MTd")
		SET(CRT_FLAG_RELEASE "/MT")
	ELSE()
		SET(CRT_FLAG_DEBUG "/MDd")
		SET(CRT_FLAG_RELEASE "/MD")
	ENDIF()

	IF (MSVC_CRTDBG)
		SET(CRT_FLAG_DEBUG "${CRT_FLAG_DEBUG} /DGIT_MSVC_CRTDBG")
	ENDIF()

	# /Zi - Create debugging information
	# /Od - Disable optimization
	# /D_DEBUG - #define _DEBUG
	# /MTd - Statically link the multithreaded debug version of the CRT
	# /MDd - Dynamically link the multithreaded debug version of the CRT
	# /RTC1 - Run time checks
	SET(CMAKE_C_FLAGS_DEBUG "/Zi /Od /D_DEBUG /RTC1 ${CRT_FLAG_DEBUG}")

	# /DNDEBUG - Disables asserts
	# /MT - Statically link the multithreaded release version of the CRT
	# /MD - Dynamically link the multithreaded release version of the CRT
	# /O2 - Optimize for speed
	# /Oy - Enable frame pointer omission (FPO) (otherwise CMake will automatically turn it off)
	# /GL - Link time code generation (whole program optimization)
	# /Gy - Function-level linking
	SET(CMAKE_C_FLAGS_RELEASE "/DNDEBUG /O2 /Oy /GL /Gy ${CRT_FLAG_RELEASE}")

	# /Oy- - Disable frame pointer omission (FPO)
	SET(CMAKE_C_FLAGS_RELWITHDEBINFO "/DNDEBUG /Zi /O2 /Oy- /GL /Gy ${CRT_FLAG_RELEASE}")

	# /O1 - Optimize for size
	SET(CMAKE_C_FLAGS_MINSIZEREL "/DNDEBUG /O1 /Oy /GL /Gy ${CRT_FLAG_RELEASE}")

	# /DYNAMICBASE - Address space load randomization (ASLR)
	# /NXCOMPAT - Data execution prevention (DEP)
	# /LARGEADDRESSAWARE - >2GB user address space on x86
	# /VERSION - Embed version information in PE header
	SET(CMAKE_EXE_LINKER_FLAGS "/DYNAMICBASE /NXCOMPAT /LARGEADDRESSAWARE /VERSION:${LIBGIT2_VERSION_MAJOR}.${LIBGIT2_VERSION_MINOR}")

	# /DEBUG - Create a PDB
	# /LTCG - Link time code generation (whole program optimization)
	# /OPT:REF /OPT:ICF - Fold out duplicate code at link step
	# /INCREMENTAL:NO - Required to use /LTCG
	# /DEBUGTYPE:cv,fixup - Additional data embedded in the PDB (requires /INCREMENTAL:NO, so not on for Debug)
	SET(CMAKE_EXE_LINKER_FLAGS_DEBUG "/DEBUG")
	SET(CMAKE_EXE_LINKER_FLAGS_RELEASE "/RELEASE /LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO")
	SET(CMAKE_EXE_LINKER_FLAGS_RELWITHDEBINFO "/DEBUG /RELEASE /LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO /DEBUGTYPE:cv,fixup")
	SET(CMAKE_EXE_LINKER_FLAGS_MINSIZEREL "/RELEASE /LTCG /OPT:REF /OPT:ICF /INCREMENTAL:NO")

	# Same linker settings for DLL as EXE
	SET(CMAKE_SHARED_LINKER_FLAGS "${CMAKE_EXE_LINKER_FLAGS}")
	SET(CMAKE_SHARED_LINKER_FLAGS_DEBUG "${CMAKE_EXE_LINKER_FLAGS_DEBUG}")
	SET(CMAKE_SHARED_LINKER_FLAGS_RELEASE "${CMAKE_EXE_LINKER_FLAGS_RELEASE}")
	SET(CMAKE_SHARED_LINKER_FLAGS_RELWITHDEBINFO "${CMAKE_EXE_LINKER_FLAGS_RELWITHDEBINFO}")
	SET(CMAKE_SHARED_LINKER_FLAGS_MINSIZEREL "${CMAKE_EXE_LINKER_FLAGS_MINSIZEREL}")

	SET(WIN_RC "src/win32/git2.rc")

   # Precompiled headers

ELSE ()
	SET(CMAKE_C_FLAGS "-D_GNU_SOURCE -Wall -Wextra ${CMAKE_C_FLAGS}")

	IF (CMAKE_SYSTEM_NAME MATCHES "(Solaris|SunOS)")
		SET(CMAKE_C_FLAGS "-std=c99 -D_POSIX_C_SOURCE=200112L -D__EXTENSIONS__ -D_POSIX_PTHREAD_SEMANTICS ${CMAKE_C_FLAGS}")
	ENDIF()

	IF (WIN32 AND NOT CYGWIN)
		SET(CMAKE_C_FLAGS_DEBUG "-D_DEBUG")
	ENDIF ()

	IF (MINGW) # MinGW always does PIC and complains if we tell it to
		STRING(REGEX REPLACE "-fPIC" "" CMAKE_SHARED_LIBRARY_C_FLAGS "${CMAKE_SHARED_LIBRARY_C_FLAGS}")
		# MinGW >= 3.14 uses the C99-style stdio functions
		# automatically, but forks like mingw-w64 still want
		# us to define this in order to use them
		ADD_DEFINITIONS(-D__USE_MINGW_ANSI_STDIO=1)

	ELSEIF (BUILD_SHARED_LIBS)
		ADD_C_FLAG_IF_SUPPORTED(-fvisibility=hidden)

		SET(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -fPIC")
	ENDIF ()

	ADD_C_FLAG_IF_SUPPORTED(-Wdocumentation)
	ADD_C_FLAG_IF_SUPPORTED(-Wno-missing-field-initializers)
	ADD_C_FLAG_IF_SUPPORTED(-Wstrict-aliasing=2)
	ADD_C_FLAG_IF_SUPPORTED(-Wstrict-prototypes)
	ADD_C_FLAG_IF_SUPPORTED(-Wdeclaration-after-statement)
	ADD_C_FLAG_IF_SUPPORTED(-Wno-unused-const-variable)
	ADD_C_FLAG_IF_SUPPORTED(-Wno-unused-function)

	IF (APPLE) # Apple deprecated OpenSSL
		ADD_C_FLAG_IF_SUPPORTED(-Wno-deprecated-declarations)
	ENDIF()

	IF (PROFILE)
		SET(CMAKE_C_FLAGS "-pg ${CMAKE_C_FLAGS}")
		SET(CMAKE_EXE_LINKER_FLAGS "-pg ${CMAKE_EXE_LINKER_FLAGS}")
	ENDIF ()
ENDIF()

CHECK_FUNCTION_EXISTS(futimens HAVE_FUTIMENS)
IF (HAVE_FUTIMENS)
	ADD_DEFINITIONS(-DHAVE_FUTIMENS)
ENDIF ()

CHECK_FUNCTION_EXISTS(qsort_r HAVE_QSORT_R)
IF (HAVE_QSORT_R)
	ADD_DEFINITIONS(-DHAVE_QSORT_R)
ENDIF ()

CHECK_FUNCTION_EXISTS(qsort_s HAVE_QSORT_S)
IF (HAVE_QSORT_S)
	ADD_DEFINITIONS(-DHAVE_QSORT_S)
ENDIF ()

IF( NOT CMAKE_CONFIGURATION_TYPES )
	# Build Debug by default
	IF (NOT CMAKE_BUILD_TYPE)
		SET(CMAKE_BUILD_TYPE "Debug" CACHE STRING "Choose the type of build, options are: Debug Release RelWithDebInfo MinSizeRel." FORCE)
	ENDIF ()
ELSE()
	# Using a multi-configuration generator eg MSVC or Xcode
	# that uses CMAKE_CONFIGURATION_TYPES and not CMAKE_BUILD_TYPE
ENDIF()

IF (SECURITY_FOUND)
  ADD_DEFINITIONS(-DGIT_SECURE_TRANSPORT)
  INCLUDE_DIRECTORIES(${SECURITY_INCLUDE_DIR})
ENDIF ()

IF (OPENSSL_FOUND)
  ADD_DEFINITIONS(-DGIT_OPENSSL)
  INCLUDE_DIRECTORIES(${OPENSSL_INCLUDE_DIR})
  SET(SSL_LIBRARIES ${OPENSSL_LIBRARIES})
ENDIF()



IF (THREADSAFE)
	IF (NOT WIN32)
		FIND_PACKAGE(Threads REQUIRED)
	ENDIF()

	ADD_DEFINITIONS(-DGIT_THREADS)
ENDIF()

ADD_DEFINITIONS(-D_FILE_OFFSET_BITS=64)

# Collect sourcefiles
FILE(GLOB SRC_H include/git2.h include/git2/*.h include/git2/sys/*.h)

# On Windows use specific platform sources
IF (WIN32 AND NOT CYGWIN)
	ADD_DEFINITIONS(-DWIN32 -D_WIN32_WINNT=0x0501)
	FILE(GLOB SRC_OS src/win32/*.c src/win32/*.h)
ELSEIF (AMIGA)
	ADD_DEFINITIONS(-DNO_ADDRINFO -DNO_READDIR_R -DNO_MMAP)
ELSE()
	IF (VALGRIND)
		ADD_DEFINITIONS(-DNO_MMAP)
	ENDIF()
	FILE(GLOB SRC_OS src/unix/*.c src/unix/*.h)
ENDIF()
FILE(GLOB SRC_GIT2 src/*.c src/*.h src/transports/*.c src/transports/*.h src/xdiff/*.c src/xdiff/*.h)

# Determine architecture of the machine
IF (CMAKE_SIZEOF_VOID_P EQUAL 8)
	ADD_DEFINITIONS(-DGIT_ARCH_64)
ELSEIF (CMAKE_SIZEOF_VOID_P EQUAL 4)
	ADD_DEFINITIONS(-DGIT_ARCH_32)
ELSE()
	MESSAGE(FATAL_ERROR "Unsupported architecture")
ENDIF()

# Compile and link libgit2
ADD_LIBRARY(git2 ${SRC_H} ${SRC_GIT2} ${SRC_OS} ${SRC_ZLIB} ${SRC_HTTP} ${SRC_REGEX} ${SRC_SHA1} ${WIN_RC})
TARGET_LINK_LIBRARIES(git2 ${SECURITY_DIRS})
TARGET_LINK_LIBRARIES(git2 ${COREFOUNDATION_DIRS})
TARGET_LINK_LIBRARIES(git2 ${SSL_LIBRARIES})
TARGET_LINK_LIBRARIES(git2 ${SSH_LIBRARIES})
TARGET_LINK_LIBRARIES(git2 ${GSSAPI_LIBRARIES})
TARGET_LINK_LIBRARIES(git2 ${ICONV_LIBRARIES})
TARGET_OS_LIBRARIES(git2)

# Workaround for Cmake bug #0011240 (see http://public.kitware.com/Bug/view.php?id=11240)
# Win64+MSVC+static libs = linker error
IF(MSVC AND GIT_ARCH_64 AND NOT BUILD_SHARED_LIBS)
  SET_TARGET_PROPERTIES(git2 PROPERTIES STATIC_LIBRARY_FLAGS "/MACHINE:x64")
ENDIF()

MSVC_SPLIT_SOURCES(git2)

IF (SONAME)
	SET_TARGET_PROPERTIES(git2 PROPERTIES VERSION ${LIBGIT2_VERSION_STRING})
	SET_TARGET_PROPERTIES(git2 PROPERTIES SOVERSION ${LIBGIT2_SOVERSION})
	IF (LIBGIT2_FILENAME)
		ADD_DEFINITIONS(-DLIBGIT2_FILENAME=\"${LIBGIT2_FILENAME}\")
		SET_TARGET_PROPERTIES(git2 PROPERTIES OUTPUT_NAME ${LIBGIT2_FILENAME})
	ENDIF()
ENDIF()
STRING(REPLACE ";" " " LIBGIT2_PC_LIBS "${LIBGIT2_PC_LIBS}")
CONFIGURE_FILE(${CMAKE_CURRENT_SOURCE_DIR}/libgit2.pc.in ${CMAKE_CURRENT_BINARY_DIR}/libgit2.pc @ONLY)

IF (MSVC_IDE)
   # Precompiled headers
   SET_TARGET_PROPERTIES(git2 PROPERTIES COMPILE_FLAGS "/Yuprecompiled.h /FIprecompiled.h")
   SET_SOURCE_FILES_PROPERTIES(src/win32/precompiled.c COMPILE_FLAGS "/Ycprecompiled.h")
ENDIF ()

# Install
INSTALL(TARGETS git2
	RUNTIME DESTINATION ${BIN_INSTALL_DIR}
	LIBRARY DESTINATION ${LIB_INSTALL_DIR}
	ARCHIVE DESTINATION ${LIB_INSTALL_DIR}
)
INSTALL(FILES ${CMAKE_CURRENT_BINARY_DIR}/libgit2.pc DESTINATION ${LIB_INSTALL_DIR}/pkgconfig )
INSTALL(DIRECTORY include/git2 DESTINATION ${INCLUDE_INSTALL_DIR} )
INSTALL(FILES include/git2.h DESTINATION ${INCLUDE_INSTALL_DIR} )

# Tests
IF (BUILD_CLAR)
	FIND_PACKAGE(PythonInterp)

	IF(NOT PYTHONINTERP_FOUND)
	  MESSAGE(FATAL_ERROR "Could not find a python interpeter, which is needed to build the tests. "
	    "Make sure python is available, or pass -DBUILD_CLAR=OFF to skip building the tests")
	ENDIF()

	SET(CLAR_FIXTURES "${CMAKE_CURRENT_SOURCE_DIR}/tests/resources/")
	SET(CLAR_PATH "${CMAKE_CURRENT_SOURCE_DIR}/tests")
	SET(CLAR_RESOURCES "${CMAKE_CURRENT_SOURCE_DIR}/tests/resources" CACHE PATH "Path to test resources.")
	ADD_DEFINITIONS(-DCLAR_FIXTURE_PATH=\"${CLAR_FIXTURES}\")
	ADD_DEFINITIONS(-DCLAR_RESOURCES=\"${TEST_RESOURCES}\")
	ADD_DEFINITIONS(-DCLAR_TMPDIR=\"libgit2_tests\")

	INCLUDE_DIRECTORIES(${CLAR_PATH})
	FILE(GLOB_RECURSE SRC_TEST ${CLAR_PATH}/*/*.c ${CLAR_PATH}/*/*.h)
	SET(SRC_CLAR "${CLAR_PATH}/main.c" "${CLAR_PATH}/clar_libgit2.c" "${CLAR_PATH}/clar_libgit2_trace.c" "${CLAR_PATH}/clar_libgit2_timer.c" "${CLAR_PATH}/clar.c")

	ADD_CUSTOM_COMMAND(
		OUTPUT ${CLAR_PATH}/clar.suite
		COMMAND ${PYTHON_EXECUTABLE} generate.py -f -xonline -xstress .
		DEPENDS ${SRC_TEST}
		WORKING_DIRECTORY ${CLAR_PATH}
	)

	SET_SOURCE_FILES_PROPERTIES(
		${CLAR_PATH}/clar.c
		PROPERTIES OBJECT_DEPENDS ${CLAR_PATH}/clar.suite)

	ADD_EXECUTABLE(libgit2_clar ${SRC_H} ${SRC_GIT2} ${SRC_OS} ${SRC_CLAR} ${SRC_TEST} ${SRC_ZLIB} ${SRC_HTTP} ${SRC_REGEX} ${SRC_SHA1})

	TARGET_LINK_LIBRARIES(libgit2_clar ${COREFOUNDATION_DIRS})
	TARGET_LINK_LIBRARIES(libgit2_clar ${SECURITY_DIRS})
	TARGET_LINK_LIBRARIES(libgit2_clar ${SSL_LIBRARIES})
	TARGET_LINK_LIBRARIES(libgit2_clar ${SSH_LIBRARIES})
	TARGET_LINK_LIBRARIES(libgit2_clar ${GSSAPI_LIBRARIES})
	TARGET_LINK_LIBRARIES(libgit2_clar ${ICONV_LIBRARIES})
	TARGET_OS_LIBRARIES(libgit2_clar)
	MSVC_SPLIT_SOURCES(libgit2_clar)

	IF (MSVC_IDE)
		# Precompiled headers
		SET_TARGET_PROPERTIES(libgit2_clar PROPERTIES COMPILE_FLAGS "/Yuprecompiled.h /FIprecompiled.h")
	ENDIF ()

	ENABLE_TESTING()
	IF (WINHTTP OR OPENSSL_FOUND OR SECURITY_FOUND)
		ADD_TEST(libgit2_clar libgit2_clar -ionline)
	ELSE ()
		ADD_TEST(libgit2_clar libgit2_clar -v)
	ENDIF ()
ENDIF ()

IF (TAGS)
	FIND_PROGRAM(CTAGS ctags)
	IF (NOT CTAGS)
		MESSAGE(FATAL_ERROR "Could not find ctags command")
	ENDIF ()

	FILE(GLOB_RECURSE SRC_ALL *.[ch])

	ADD_CUSTOM_COMMAND(
		OUTPUT tags
		COMMAND ${CTAGS} -a ${SRC_ALL}
		DEPENDS ${SRC_ALL}
	)
	ADD_CUSTOM_TARGET(
		do_tags ALL
		DEPENDS tags
	)
ENDIF ()

IF (BUILD_EXAMPLES)
	ADD_SUBDIRECTORY(examples)
ENDIF ()
