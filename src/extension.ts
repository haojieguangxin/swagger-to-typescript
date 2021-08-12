// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { urlsView, urlTreeDataProvider } from './views/viewUrls'

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "swagger-to-typescript" is now active!');

	const urlTreeDataProviderObj = new urlTreeDataProvider()
	new urlsView(context, urlTreeDataProviderObj)
	vscode.commands.registerCommand('swagger-to-typescript.generateTs', (params) => {
		vscode.window.showSaveDialog({}).then((item:any) => {
			if (item.path.indexOf(':/') > 0 && item.path.indexOf('/') === 0) {
				item.path = item.path.substr(1)
			}
			urlTreeDataProviderObj.generateTs(params, item.path + '.ts')
		})
    })
	// vscode.commands.registerCommand('swagger-to-typescript.generateApi', (params) => {
	// 	vscode.window.showSaveDialog({}).then((item:any) => {
	// 		if (item.path.indexOf(':/') > 0 && item.path.indexOf('/') === 0) {
	// 			item.path = item.path.substr(1)
	// 		}
	// 		urlTreeDataProviderObj.generateApi(params, item.path + '.ts')
	// 	})
	// })
	vscode.commands.registerCommand('swagger-to-typescript.refresh', () => {
		urlTreeDataProviderObj.refresh()
	})
	vscode.commands.registerCommand('swagger-to-typescript.openSwaggerUI', (url) => {
		urlTreeDataProviderObj.openSwaggerUI(url)
	})
	// context.subscriptions.push(disposable)
}

// this method is called when your extension is deactivated
export function deactivate() {}
