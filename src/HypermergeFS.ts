"use strict"

import * as vscode from "vscode"
import { Text } from "automerge/frontend/text"
import { HypermergeWrapper } from "./HypermergeWrapper"

export default class HypermergeFS implements vscode.FileSystemProvider {
  hypermerge: HypermergeWrapper
  typeCache: Map<string, "object" | "string" | "number" | "array" | "boolean">

  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.hypermerge = hypermergeWrapper
    this.typeCache = new Map()

    this.hypermerge.on("update", uri => {
      this._fireSoon({ type: vscode.FileChangeType.Changed, uri })
    })
  }

  // --- manage file metadata

  stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
    // if (!this.hypermerge.exists(uri)) {
    //   console.log(`Stating ${uri.toString()} - file not found`)
    //   throw vscode.FileSystemError.FileNotFound(uri)
    // }

    return this.hypermerge
      .openDocumentUri(uri)
      .then(document => {
        if (document === undefined) {
          throw vscode.FileSystemError.FileNotFound(uri)
        }
        return {
          ctime: Date.now(),
          mtime: Date.now(),
          size: 0,
          type: vscode.FileType.SymbolicLink,
        }
      })
      .catch(console.log)
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions
  }

  // --- manage file contents

  readFile(uri: vscode.Uri): Thenable<Uint8Array> {
    return this.hypermerge
      .openDocumentUri(uri)
      .then(document => {
        console.log(typeof document)
        switch (typeof document) {
          case "string":
            this.typeCache.set(uri.toString(), "string")
            return Buffer.from(document)

          case "number":
            this.typeCache.set(uri.toString(), "number")
            return Buffer.from(String(document))

          case "boolean":
            this.typeCache.set(uri.toString(), "boolean")
            return Buffer.from(String(document))

          default:
            if (Array.isArray(document)) {
              this.typeCache.set(uri.toString(), "array")
            } else {
              this.typeCache.set(uri.toString(), "object")
            }

            function replacer(key, value) {
              console.log(`replace ${key}, ${value} (${value instanceof Text})`)
              if (value instanceof Text) {
                return value.join('')
              }
              return value
            }

            return Buffer.from(JSON.stringify(document, replacer, 2))
        }
      })
      .catch(err => {
        console.log(err)
        return Buffer.from("")
      })
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    // not great
    if (uri.query) {
      throw vscode.FileSystemError.NoPermissions
    }

    switch (this.typeCache.get(uri.toString())) {
      case "string":
        this.hypermerge.setDocumentUri(uri, content.toString())
        break

      case "number":
        this.hypermerge.setDocumentUri(uri, parseFloat(content.toString()))
        break

      case "boolean": {
        const contents = JSON.parse(content.toString())
        if (typeof contents !== "boolean") throw new Error("Must be a boolean")
        this.hypermerge.setDocumentUri(uri, contents)
        break
      }

      case "array": {
        const contents = JSON.parse(content.toString())
        if (!Array.isArray(contents)) throw new Error("Must be an array")
        this.hypermerge.setDocumentUri(uri, contents)
        break
      }

      default: {
        const contents = JSON.parse(content.toString())
        this.hypermerge.setDocumentUri(uri, contents)
        break
      }
    }

    this._fireSoon({ type: vscode.FileChangeType.Changed, uri })
  }

  // --- manage files/folders

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    // HMMM
    throw vscode.FileSystemError.NoPermissions
  }

  delete(uri: vscode.Uri): void {
    // HMMM
    throw vscode.FileSystemError.NoPermissions
  }

  createDirectory(uri: vscode.Uri): void {
    // need to have a dummy createDirectory for saving leaf nodes
    // for ... some reason
    return
  }

  // --- manage file events

  private _emitter = new vscode.EventEmitter<vscode.FileChangeEvent[]>()
  private _bufferedEvents: vscode.FileChangeEvent[] = []
  private _fireSoonHandle: NodeJS.Timer

  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> = this
    ._emitter.event

  watch(resource: vscode.Uri, opts): vscode.Disposable {
    // ignore, fires for all changes...
    return new vscode.Disposable(() => {})
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._bufferedEvents.push(...events)
    clearTimeout(this._fireSoonHandle)
    this._fireSoonHandle = setTimeout(() => {
      this._emitter.fire(this._bufferedEvents)
      this._bufferedEvents.length = 0
    }, 5)
  }
}
