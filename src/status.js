// What the user sees while the server comes up: an item in the status bar and an output channel
// holding the detail behind it.

'use strict';

const { StatusBarAlignment, window } = require('vscode');

class Status {
  constructor() {
    this.channel = window.createOutputChannel('Souther');
    this.item = window.createStatusBarItem(StatusBarAlignment.Right, 100);
    this.item.command = 'souther.showOutput';
    this.item.show();
  }

  starting(message) {
    this.item.text = '$(loading~spin) Souther';
    this.item.tooltip = message ?? 'Starting the Souther language server';
    this.log(message ?? 'Starting the Souther language server');
  }

  ready(detail) {
    this.item.text = '$(check) Souther';
    this.item.tooltip = detail ?? 'The Souther language server is ready';
    this.log(`Ready — ${detail ?? 'the language server is running'}`);
  }

  failed(reason) {
    this.item.text = '$(error) Souther';
    this.item.tooltip = reason;
    this.log(`Not started — ${reason}`);
  }

  log(line) {
    this.channel.appendLine(line);
  }

  show() {
    this.channel.show(true);
  }

  dispose() {
    this.item.dispose();
    this.channel.dispose();
  }
}

module.exports = { Status };
