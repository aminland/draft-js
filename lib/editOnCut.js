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

var DraftModifier = require('./DraftModifier');
var EditorState = require('./EditorState');
var Style = require('fbjs/lib/Style');

var getFragmentFromSelection = require('./getFragmentFromSelection');
var getScrollPosition = require('fbjs/lib/getScrollPosition');

/**
 * On `cut` events, native behavior is allowed to occur so that the system
 * clipboard is set properly. This means that we need to take steps to recover
 * the editor DOM state after the `cut` has occurred in order to maintain
 * control of the component.
 *
 * In addition, we can keep a copy of the removed fragment, including all
 * styles and entities, for use as an internal paste.
 */
function editOnCut(editor, e) {
  var editorState = editor._latestEditorState;
  var selection = editorState.getSelection();
  var element = e.target;
  var scrollPosition = void 0;

  // No selection, so there's nothing to cut.
  if (selection.isCollapsed()) {
    e.preventDefault();
    return;
  }

  // Track the current scroll position so that it can be forced back in place
  // after the editor regains control of the DOM.
  if (element instanceof Node) {
    scrollPosition = getScrollPosition(Style.getScrollParent(element));
  }

  var fragment = getFragmentFromSelection(editorState);
  editor.setClipboard(fragment);

  // Set `cut` mode to disable all event handling temporarily.
  editor.setMode('cut');

  // Let native `cut` behavior occur, then recover control.
  setTimeout(function () {
    editor.restoreEditorDOM(scrollPosition);
    editor.exitCurrentMode();
    editor.update(removeFragment(editorState));
  }, 0);
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

function removeFragment(editorState) {
  var newContent = DraftModifier.removeRange(editorState.getCurrentContent(), editorState.getSelection(), 'forward');
  return EditorState.push(editorState, newContent, 'remove-range');
}

module.exports = editOnCut;