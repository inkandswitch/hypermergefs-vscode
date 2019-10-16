"use strict"

import * as vscode from "vscode"
import { HypermergeWrapper } from "./HypermergeWrapper"
import { RepoBackend } from "hypermerge"
import * as Block from "hypermerge/dist/Block"
import { FeedId } from "hypermerge/dist/FeedStore"

export default class HypercoreFS implements vscode.FileSystemProvider {
  back: RepoBackend

  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.back = hypermergeWrapper.repo.back
  }

  // --- manage file metadata

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    const details = parseUri(uri)

    if (!details) throw vscode.FileSystemError.FileNotFound(uri)

    const { feedId, blockIndex } = details

    if (blockIndex == null) throw vscode.FileSystemError.FileNotFound(uri)

    const feed = await this.back.feeds.getFeed(feedId)
    if (!feed) throw vscode.FileSystemError.FileNotFound(uri)

    if (!feed.has(blockIndex))
      throw vscode.FileSystemError.FileNotFound(uri)

    return {
      ctime: Date.now(),
      mtime: Date.now(),
      size: 0,
      type: vscode.FileType.SymbolicLink,
    }
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    throw vscode.FileSystemError.NoPermissions
  }

  // --- manage file contents

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    const details = parseUri(uri)

    if (!details) throw vscode.FileSystemError.FileNotFound(uri)

    const { feedId, blockIndex } = details

    if (blockIndex == null) throw vscode.FileSystemError.FileNotFound(uri)

    const feed = await this.back.feeds.getFeed(feedId)

    if (!feed) throw vscode.FileSystemError.FileNotFound(uri)

    if (!feed.has(blockIndex))
      throw vscode.FileSystemError.FileNotFound(uri)

    return new Promise((res, rej) => {
      ;(<any>feed).get(
        blockIndex,
        { wait: false },
        (err: Error | null, data?: Uint8Array) => {
          if (err) return rej(err)
          if (!data) return rej(new Error("Missing data"))

          try {
            const obj = Block.unpack(data)
            data = Buffer.from(JSON.stringify(obj, undefined, 2))
          } catch (e) {
            // not JSON data. should be fine to just continue
          }

          if (data) res(data)
        },
      )
    })
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    throw vscode.FileSystemError.NoPermissions
  }

  // --- manage files/folders

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    throw vscode.FileSystemError.NoPermissions
  }

  delete(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions
  }

  createDirectory(uri: vscode.Uri): void {
    throw vscode.FileSystemError.NoPermissions
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
}

interface Details {
  feedId: FeedId
  blockIndex?: number
}

function parseUri(uri: vscode.Uri): Details | undefined {
  if (uri.scheme !== "hypercore") return

  const [_, feedId, indexString] = uri.path.split("/")

  if (!feedId) return

  const blockIndex = indexString ? parseInt(indexString, 10) : undefined

  return {
    feedId: feedId as FeedId,
    blockIndex,
  }
}
