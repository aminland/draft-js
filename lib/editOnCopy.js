/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * 
 */

'use strict';

var ContentState = require('./ContentState');
var convertFromDraftStateToRaw = require('./convertFromDraftStateToRaw');
var getFragmentFromSelection = require('./getFragmentFromSelection');

/**
 * If we have a selection, create a ContentState fragment and store
 * it in our internal clipboard. Subsequent paste events will use this
 * fragment if no external clipboard data is supplied.
 */
function editOnCopy(editor, e) {
  var editorState = editor._latestEditorState;
  var selection = editorState.getSelection();

  // No selection, so there's nothing to copy.
  if (selection.isCollapsed()) {
    e.preventDefault();
    return;
  }

  var fragment = getFragmentFromSelection(editor._latestEditorState);

  editor.setClipboard(fragment);

  // IE11 does not support ClipboardEvent.clipboardData.
  if (e.clipboardData && fragment) {
    var content = ContentState.createFromBlockArray(fragment.toArray());
    var serialisedContent = JSON.stringify(convertFromDraftStateToRaw(content));

    var fragmentElt = document.createElement('div');
    var domSelection = window.getSelection();
    fragmentElt.appendChild(domSelection.getRangeAt(0).cloneContents());
    fragmentElt.setAttribute('data-editor-content', serialisedContent);
    // We set the style property to replicate the browser's behavior of inline
    // styles in rich text copy-paste. This is important for line breaks to be
    // interpreted correctly when pasted into another word processor.
    fragmentElt.setAttribute('style', 'white-space: pre-wrap;');

    e.clipboardData.setData('text/plain', domSelection.toString());
    var el = fragmentElt.cloneNode();
    Array.from(
    // contenteditable=false does nothing special here,
    // it's just whatever elements we want to remove have it set to false
    el.querySelectorAll('[contenteditable=false]')).forEach(function (e) {
      return e.remove();
    });
    e.clipboardData.setData('text/html', el.outerHTML);

    e.preventDefault();
  }
}

module.exports = editOnCopy;