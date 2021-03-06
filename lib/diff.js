var NodeGit = require("../");
var Diff = NodeGit.Diff;
var normalizeOptions = NodeGit.Utils.normalizeOptions;
var Patch = NodeGit.Patch;


/**
 * Retrieve patches in this difflist
 *
 * @async
 * @return {Array<ConvenientPatch>} a promise that resolves to an array of
 *                                      ConvenientPatches
 */
Diff.prototype.patches = function() {
  return Patch.convenientFromDiff(this);
};

// Override Diff.indexToWorkdir to normalize opts
var indexToWorkdir = Diff.indexToWorkdir;
Diff.indexToWorkdir = function(repo, index, opts) {
  opts = normalizeOptions(opts, NodeGit.DiffOptions);
  return indexToWorkdir(repo, index, opts);
};

// Override Diff.treeToIndex to normalize opts
var treeToIndex = Diff.treeToIndex;
Diff.treeToIndex = function(repo, tree, index, opts) {
  opts = normalizeOptions(opts, NodeGit.DiffOptions);
  return treeToIndex(repo, tree, index, opts);
};

// Override Diff.treeToTree to normalize opts
var treeToTree = Diff.treeToTree;
Diff.treeToTree = function(repo, from_tree, to_tree, opts) {
  opts = normalizeOptions(opts, NodeGit.DiffOptions);
  return treeToTree(repo, from_tree, to_tree, opts);
};

// Override Diff.treeToWorkdir to normalize opts
var treeToWorkdir = Diff.treeToWorkdir;
Diff.treeToWorkdir = function(repo, tree, opts) {
  opts = normalizeOptions(opts, NodeGit.DiffOptions);
  return treeToWorkdir(repo, tree, opts);
};

// Override Diff.treeToWorkdir to normalize opts
var treeToWorkdirWithIndex = Diff.treeToWorkdirWithIndex;
Diff.treeToWorkdirWithIndex = function(repo, tree, opts) {
  opts = normalizeOptions(opts, NodeGit.DiffOptions);
  return treeToWorkdirWithIndex(repo, tree, opts);
};

// Override Diff.findSimilar to normalize opts
var findSimilar = Diff.prototype.findSimilar;
Diff.prototype.findSimilar = function(opts) {
  opts = normalizeOptions(opts, NodeGit.DiffFindOptions);
  return findSimilar.call(this, opts);
};

var blobToBuffer = Diff.blobToBuffer;
Diff.blobToBuffer= function(
    old_blob,
    old_as_path,
    buffer,
    buffer_as_path,
    opts,
    file_cb,
    binary_cb,
    hunk_cb,
    line_cb) {
  var bufferText;
  var bufferLength;
  if (buffer instanceof Buffer) {
    bufferText = buffer.toString("utf8");
    bufferLength = buffer.length;
  } else {
    bufferText = buffer;
    bufferLength = !buffer ? 0 : Buffer.byteLength(buffer, "utf8");
  }

  opts = normalizeOptions(opts, NodeGit.DiffOptions);

  return blobToBuffer.call(
    this,
    old_blob,
    old_as_path,
    buffer,
    bufferLength,
    buffer_as_path,
    opts,
    file_cb,
    binary_cb,
    hunk_cb,
    line_cb,
    null);
};
