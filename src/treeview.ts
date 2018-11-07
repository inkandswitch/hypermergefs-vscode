import * as vscode from 'vscode'
import { FauxMerge } from './fauxmerge'

export interface HypermergeNode {
  label: string;
  resource: vscode.Uri;
  isDirectory: boolean;
}

export class HypermergeModel {
  hypermerge = new FauxMerge()

  validateURL(input: string) {
    let url
    try {
      url = vscode.Uri.parse(input)
    }
    catch {
      return "invalid URL"
    }
    if (url.scheme !== 'hypermergefs') {
      return "invalid scheme -- must be a hypermergefs URL"
    }
    if (url.authority != "") {
      return "invalid format"
    }
    return "" // we can return a hint string if it's invalid
  }


  public get roots(): Thenable<HypermergeNode[]> {
    return Promise.resolve([
      {
        resource: vscode.Uri.parse("hypermergefs:/root"),
        label: "Root",
        isDirectory: true
      }])
  }

  public getChildren(node: HypermergeNode): Thenable<HypermergeNode[]> {
    return new Promise((resolve) => {
      const subDoc = this.hypermerge.openDocumentUri(node.resource)
      const { children = [] } = subDoc
      const subNodes = children.map(([name, uri]) => ({ label: name, resource: vscode.Uri.parse(uri), isDirectory: false }))
      resolve(subNodes)
    })
  }

  public getContent(resource: vscode.Uri): Thenable<string> {
    return Promise.resolve(`content ${resource.toString()}`)
  }
}

export class HypermergeTreeDataProvider implements vscode.TreeDataProvider<HypermergeNode>, vscode.TextDocumentContentProvider {

  private _onDidChangeTreeData: vscode.EventEmitter<any> = new vscode.EventEmitter<any>();
  readonly onDidChangeTreeData: vscode.Event<any> = this._onDidChangeTreeData.event;

  constructor(private readonly model: HypermergeModel) { }

  public refresh(): any {
    this._onDidChangeTreeData.fire();
  }

  public getTreeItem(element: HypermergeNode): vscode.TreeItem {
    return {
      label: element.label || element.resource.path.slice(1),
      resourceUri: element.resource,
      collapsibleState: element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : void 0,
      command: {
        command: 'vscode.open',
        arguments: [element.resource],
        title: 'Open Hypermerge Document'
      }
    };
  }

  public getChildren(element?: HypermergeNode): HypermergeNode[] | Thenable<HypermergeNode[]> {
    return element ? this.model.getChildren(element) : this.model.roots;
  }

  public getParent(element: HypermergeNode): HypermergeNode | null {
    const parent = element.resource.with({ path: (element.resource.path) });
    return parent.path !== '//' ? { label: "parentHACK", resource: parent, isDirectory: true } : null;
  }

  public provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
    return this.model.getContent(uri).then(content => content);
  }
}

export class HypermergeExplorer {

  private hypermergeViewer: vscode.TreeView<HypermergeNode>;

  constructor(context: vscode.ExtensionContext) {
    const hypermergeModel = new HypermergeModel();
    const treeDataProvider = new HypermergeTreeDataProvider(hypermergeModel);

    this.hypermergeViewer = vscode.window.createTreeView('hypermergeExplorer', { treeDataProvider });

    vscode.commands.registerCommand('hypermergeExplorer.refresh',
      () => treeDataProvider.refresh()
    );

    vscode.commands.registerCommand('hypermergeExplorer.register', async () => {
      const uriString = await vscode.window.showInputBox({
        placeHolder: 'Browse which hypermerge URL?',
        validateInput: hypermergeModel.validateURL
      });
      if (uriString) {
        const uri = vscode.Uri.parse(uriString)
        vscode.window.showInformationMessage(`Tried to add ${uri.toString()}`)
      }
    });

    vscode.commands.registerCommand('hypermergeExplorer.openHypermergeResource',
      resource => this.openResource(resource)
    );
    vscode.commands.registerCommand('hypermergeExplorer.revealResource',
      () => this.reveal()
    );
  }

  private openResource(resource: vscode.Uri): void {
    vscode.window.showTextDocument(resource);
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
      if (vscode.window.activeTextEditor.document.uri.scheme === 'hypermergefs') {
        return { label: "getnodehack", resource: vscode.window.activeTextEditor.document.uri, isDirectory: false };
      }
    }
    return null;
  }
}