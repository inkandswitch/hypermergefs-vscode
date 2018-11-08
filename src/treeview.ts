import * as vscode from "vscode";
import { HypermergeWrapper } from "./fauxmerge";

export interface HypermergeNode {
  resource: vscode.Uri;
}

export class HypermergeModel {
  // emit updates to the TreeDataProvider when a document changes
  private _onDocumentUpdated: vscode.EventEmitter<
    HypermergeNode | undefined
  > = new vscode.EventEmitter<HypermergeNode | undefined>();
  readonly onDocumentUpdated: vscode.Event<any> = this._onDocumentUpdated.event;

  hypermerge: HypermergeWrapper;
  constructor(hypermergeWrapper: HypermergeWrapper) {
    this.hypermerge = hypermergeWrapper;

    this.hypermerge.addListener("update", uri => {
      this._onDocumentUpdated.fire({
        resource: uri
      });
    });
  }

  validateURL(input: string) {
    let url;
    try {
      url = vscode.Uri.parse(input);
    } catch {
      return "invalid URL";
    }
    if (url.scheme !== "hypermergefs") {
      return "invalid scheme -- must be a hypermergefs URL";
    }
    if (url.authority != "") {
      return "invalid format";
    }
    return ""; // we can return a hint string if it's invalid
  }

  public addRoot(uriString: string) {
    const roots =
      vscode.workspace
        .getConfiguration("hypermergefs")
        .get<string[]>("roots") || [];
    vscode.workspace
      .getConfiguration("hypermergefs")
      .update(
        "roots",
        [uriString, ...roots],
        vscode.ConfigurationTarget.Global
      );
  }

  public get roots(): Thenable<HypermergeNode[]> {
    return new Promise(resolve => {
      const roots =
        vscode.workspace
          .getConfiguration("hypermergefs")
          .get<string[]>("roots") || [];
      resolve(
        roots.map((root, i) => ({
          resource: vscode.Uri.parse(root)
        }))
      );
    });
  }

  public getChildren(node: HypermergeNode): Thenable<HypermergeNode[]> {
    return new Promise(resolve => {
      const subDoc = this.hypermerge.openDocumentUri(node.resource);
      const { children = [] } = subDoc;
      const subNodes = children.map(([name, uri]) => ({
        resource: vscode.Uri.parse(uri)
      }));
      resolve(subNodes);
    });
  }
}

export class HypermergeTreeDataProvider
  implements vscode.TreeDataProvider<HypermergeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    HypermergeNode | undefined
  > = new vscode.EventEmitter<HypermergeNode | undefined>();
  readonly onDidChangeTreeData: vscode.Event<HypermergeNode | undefined> = this
    ._onDidChangeTreeData.event;

  constructor(private readonly model: HypermergeModel) {
    this.model.onDocumentUpdated(event => {
      // Right now, down in extHostTreeViews.ts we eventually reach a refresh() call which
      // tries to pull the value below out of "this.nodes" and can't, because it's a compound value.
      // ... so, this will refresh the whole tree which is fine for now.
      // this._onDidChangeTreeData.fire(event);
      this._onDidChangeTreeData.fire();
    });
  }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeNode): vscode.TreeItem {
    return {
      label: element.resource.path.slice(1),
      resourceUri: element.resource,
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      command: {
        command: "hypermergeExplorer.open",
        arguments: [element.resource],
        title: "Open Hypermerge Document"
      }
    };
  }

  public getChildren(
    element?: HypermergeNode
  ): HypermergeNode[] | Thenable<HypermergeNode[]> {
    return element ? this.model.getChildren(element) : this.model.roots;
  }

  public getParent(element: HypermergeNode): HypermergeNode | null {
    // there isn't necessarily a parent for a particular node in our system
    return null;
  }
}

export class HypermergeExplorer {
  // TODO:
  // we can + should watch open files for edits and refresh those nodes
  // we should set the media type to JSON
  // plus icon for "add root"
  // better error reporting on invalid json
  // watch files for incoming changes
  // actually diff the files on save instead of replacing them
  // set language to JSON on vscode.open and not just hypermergefs.open

  private hypermergeViewer: vscode.TreeView<HypermergeNode>;

  constructor(
    context: vscode.ExtensionContext,
    hypermergeWrapper: HypermergeWrapper
  ) {
    const hypermergeModel = new HypermergeModel(hypermergeWrapper);
    const treeDataProvider = new HypermergeTreeDataProvider(hypermergeModel);

    this.hypermergeViewer = vscode.window.createTreeView("hypermergeExplorer", {
      treeDataProvider
    });

    vscode.commands.registerCommand("hypermergeExplorer.refresh", () =>
      treeDataProvider.refresh()
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("hypermergefs.roots")) {
          treeDataProvider.refresh();
        }
      })
    );

    vscode.commands.registerCommand("hypermergeExplorer.register", async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: "Browse which hypermerge URL?",
        validateInput: hypermergeModel.validateURL
      });
      if (uriString) {
        hypermergeModel.addRoot(uriString);
        treeDataProvider.refresh();
      }
    });

    vscode.commands.registerCommand("hypermergeExplorer.open", resource =>
      this.openResource(resource)
    );
    vscode.commands.registerCommand("hypermergeExplorer.revealResource", () =>
      this.reveal()
    );
  }

  private openResource(resource: vscode.Uri): void {
    vscode.workspace.openTextDocument(resource).then(document => {
      (vscode.languages as any).setTextDocumentLanguage(document, "json");
      vscode.window.showTextDocument(document);
    });
  }

  private reveal(): Thenable<void> | null {
    const node = this.getNode();
    if (node) {
      return this.hypermergeViewer.reveal(node);
    }
    return null;
  }

  private getNode(): HypermergeNode | null {
    if (vscode.window.activeTextEditor) {
      if (
        vscode.window.activeTextEditor.document.uri.scheme === "hypermergefs"
      ) {
        return {
          resource: vscode.window.activeTextEditor.document.uri
        };
      }
    }
    return null;
  }
}
