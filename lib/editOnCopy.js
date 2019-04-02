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

var _assign = require('object-assign');

var _extends = _assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
    var el = fragmentElt.cloneNode(true);
    Array.from(
    // contenteditable=false does nothing special here,
    // it's just whatever elements we want to remove have it set to false
    el.querySelectorAll('[contenteditable=false]')).forEach(function (e) {
      return e.remove();
    });
    e.clipboardData.setData('text/html', el.outerHTML);

    var fragmentKeys = fragment.keySeq().toJS();
    var startKey = selection.getStartKey();
    var endKey = selection.getEndKey();
    var selectedBlockKeys = editorState.getCurrentContent().getBlockMap().keySeq().skipUntil(function (item) {
      return item === startKey;
    }).takeUntil(function (item) {
      return item === endKey;
    }).concat([endKey]).toJS();
    var keyMap = selectedBlockKeys.reduce(function (acc, item, index) {
      return _extends({}, acc, _defineProperty({}, fragmentKeys[index], item));
    }, {});
    var blockKeyToElementMap = fragment.keySeq().toJS().reduce(function (acc, item) {
      var selector = '[data-block="true"][data-offset-key="' + keyMap[item] + '-0-0"]';
      var element = el.querySelector(selector);
      if (!element) {
        element = document.createElement('div');
        element.innerHTML = fragment.getIn([item, 'text'], '');
      }
      return _extends({}, acc, _defineProperty({}, item, element));
    }, {});
    var outputElement = document.createElement('div');
    outputElement.setAttribute('data-editor-content', serialisedContent);
    fragmentElt.setAttribute('style', 'white-space: pre-wrap;');

    var getHasChild = function getHasChild(contentState, block) {
      var blockAfter = contentState.getBlockAfter(block.getKey());
      if (!blockAfter) {
        return false;
      }
      return blockAfter.getIn(['data', 'indent'], 0) > block.getIn(['data', 'indent'], 0);
    };
    var getIsLastChild = function getIsLastChild(contentState, block) {
      var blockAfter = contentState.getBlockAfter(block.getKey());
      if (!blockAfter) {
        return false;
      }
      return blockAfter.getIn(['data', 'indent'], 0) < block.getIn(['data', 'indent'], 0);
    };
    var inner = content.getBlocksAsArray().reduce(function (acc, item) {
      var hasChild = getHasChild(content, item);
      var isLastChild = getIsLastChild(content, item);
      var indent = item.getIn(['data', 'indent'], 0);
      var lastIndentation = acc.lastIndentation,
          html = acc.html;

      var itemElement = blockKeyToElementMap[item.getKey()];
      // if (["todo", "agenda"].includes(item.getType())) {
      //   const checkbox = document.createElement("input")
      //   checkbox.setAttribute("type", "checkbox")
      //   if (item.getIn(['data', 'done'])) {
      //     checkbox.setAttribute('checked', '')
      //   }
      //   itemElement.prepend(checkbox)
      // }
      var currentItemHtml = itemElement.outerHTML;

      if (indent) {
        currentItemHtml = '<li>' + currentItemHtml + '</li>';
      }

      var sunkDepth = void 0;
      if ((sunkDepth = indent - lastIndentation) > 0) {
        currentItemHtml = '<ul>'.repeat(sunkDepth) + currentItemHtml;
      }

      if (sunkDepth < 0) {
        currentItemHtml = '</ul>'.repeat(-sunkDepth) + currentItemHtml;
      }

      return {
        lastIndentation: indent,
        html: html + currentItemHtml
      };
    }, { lastIndentation: 0, html: '' });
    outputElement.innerHTML = inner.html;
    e.clipboardData.setData('text/html', outputElement.outerHTML);
    e.preventDefault();
  }
}

module.exports = editOnCopy;