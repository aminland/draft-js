/**
 * Copyright (c) 2013-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @format
 * @flow
 */

'use strict';

import type DraftEditor from 'DraftEditor.react';

const ContentState = require('ContentState');
const convertFromDraftStateToRaw = require('convertFromDraftStateToRaw');

const DraftModifier = require('DraftModifier');
const EditorState = require('EditorState');
const Style = require('Style');

const getFragmentFromSelection = require('getFragmentFromSelection');
const getScrollPosition = require('getScrollPosition');

/**
 * On `cut` events, native behavior is allowed to occur so that the system
 * clipboard is set properly. This means that we need to take steps to recover
 * the editor DOM state after the `cut` has occurred in order to maintain
 * control of the component.
 *
 * In addition, we can keep a copy of the removed fragment, including all
 * styles and entities, for use as an internal paste.
 */
function editOnCut(editor: DraftEditor, e: SyntheticClipboardEvent<>): void {
  const editorState = editor._latestEditorState;
  const selection = editorState.getSelection();
  const element = e.target;
  let scrollPosition;

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

  const fragment = getFragmentFromSelection(editorState);
  editor.setClipboard(fragment);

  // Set `cut` mode to disable all event handling temporarily.
  editor.setMode('cut');

  // Let native `cut` behavior occur, then recover control.
  setTimeout(() => {
    editor.restoreEditorDOM(scrollPosition);
    editor.exitCurrentMode();
    editor.update(removeFragment(editorState));
  }, 0);

  // IE11 does not support ClipboardEvent.clipboardData.
  if (e.clipboardData && fragment) {
    const content = ContentState.createFromBlockArray(fragment.toArray());
    const serialisedContent = JSON.stringify(
      convertFromDraftStateToRaw(content),
    );

    const fragmentElt = document.createElement('div');
    const domSelection = window.getSelection();
    fragmentElt.appendChild(domSelection.getRangeAt(0).cloneContents());
    fragmentElt.setAttribute('data-editor-content', serialisedContent);
    // We set the style property to replicate the browser's behavior of inline
    // styles in rich text copy-paste. This is important for line breaks to be
    // interpreted correctly when pasted into another word processor.
    fragmentElt.setAttribute('style', 'white-space: pre-wrap;');

    e.clipboardData.setData('text/plain', domSelection.toString());
    const el = fragmentElt.cloneNode(true);
    Array.from(
      // contenteditable=false does nothing special here,
      // it's just whatever elements we want to remove have it set to false
      el.querySelectorAll('[contenteditable=false]'),
    ).forEach(e => e.remove());
    e.clipboardData.setData('text/html', el.outerHTML);

    const fragmentKeys = fragment.keySeq().toJS();
    const startKey = selection.getStartKey();
    const endKey = selection.getEndKey();
    const selectedBlockKeys = editorState
      .getCurrentContent()
      .getBlockMap()
      .keySeq()
      .skipUntil(item => item === startKey)
      .takeUntil(item => item === endKey)
      .concat([endKey])
      .toJS();
    var keyMap = selectedBlockKeys.reduce((acc, item, index) => {
      return {...acc, [fragmentKeys[index]]: item};
    }, {});
    const blockKeyToElementMap = fragment
      .keySeq()
      .toJS()
      .reduce((acc, item) => {
        const selector = `[data-block="true"][data-offset-key="${
          keyMap[item]
        }-0-0"]`;
        let element = el.querySelector(selector);
        if (!element) {
          element = document.createElement('div');
          element.innerHTML = fragment.getIn([item, 'text'], '');
        }
        return {...acc, [item]: element};
      }, {});
    const outputElement = document.createElement('div');
    outputElement.setAttribute('data-editor-content', serialisedContent);
    fragmentElt.setAttribute('style', 'white-space: pre-wrap;');

    const getHasChild = (contentState, block) => {
      const blockAfter = contentState.getBlockAfter(block.getKey());
      if (!blockAfter) {
        return false;
      }
      return (
        blockAfter.getIn(['data', 'indent'], 0) >
        block.getIn(['data', 'indent'], 0)
      );
    };
    const getIsLastChild = (contentState, block) => {
      const blockAfter = contentState.getBlockAfter(block.getKey());
      if (!blockAfter) {
        return false;
      }
      return (
        blockAfter.getIn(['data', 'indent'], 0) <
        block.getIn(['data', 'indent'], 0)
      );
    };
    const inner = content.getBlocksAsArray().reduce(
      (acc, item) => {
        const hasChild = getHasChild(content, item);
        const isLastChild = getIsLastChild(content, item);
        const indent = item.getIn(['data', 'indent'], 0);
        let {lastIndentation, html} = acc;
        const itemElement = blockKeyToElementMap[item.getKey()];
        // if (["todo", "agenda"].includes(item.getType())) {
        //   const checkbox = document.createElement("input")
        //   checkbox.setAttribute("type", "checkbox")
        //   if (item.getIn(['data', 'done'])) {
        //     checkbox.setAttribute('checked', '')
        //   }
        //   itemElement.prepend(checkbox)
        // }
        let currentItemHtml = itemElement.outerHTML;

        if (indent) {
          currentItemHtml = `<li>${currentItemHtml}</li>`;
        }

        let sunkDepth;
        if ((sunkDepth = indent - lastIndentation) > 0) {
          currentItemHtml = '<ul>'.repeat(sunkDepth) + currentItemHtml;
        }

        if (sunkDepth < 0) {
          currentItemHtml = '</ul>'.repeat(-sunkDepth) + currentItemHtml;
        }

        return {
          lastIndentation: indent,
          html: html + currentItemHtml,
        };
      },
      {lastIndentation: 0, html: ''}
    );
    outputElement.innerHTML = inner.html;
    e.clipboardData.setData('text/html', outputElement.outerHTML);
    e.preventDefault();
  }
}

function removeFragment(editorState: EditorState): EditorState {
  const newContent = DraftModifier.removeRange(
    editorState.getCurrentContent(),
    editorState.getSelection(),
    'forward',
  );
  return EditorState.push(editorState, newContent, 'remove-range');
}

module.exports = editOnCut;
