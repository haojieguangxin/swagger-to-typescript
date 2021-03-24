import * as vscode from 'vscode'
import * as fs from 'fs'
import axios from 'axios'
export class urlsView {
    constructor(context: vscode.ExtensionContext, urlTreeDataProvider: urlTreeDataProvider) {
        vscode.window.registerTreeDataProvider(
            'swagger-config',
            urlTreeDataProvider
        );
        const view = vscode.window.createTreeView('swagger-config', { treeDataProvider: urlTreeDataProvider, showCollapseAll: true })
		context.subscriptions.push(view)
	}
}

export class urlTreeDataProvider implements vscode.TreeDataProvider<urlItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<urlItem | undefined | null | void> = new vscode.EventEmitter<urlItem | undefined | null | void>()
    readonly onDidChangeTreeData: vscode.Event<urlItem | undefined | null | void> = this._onDidChangeTreeData.event
  
    // panel: any

    refresh(): void {
        this._onDidChangeTreeData.fire()
    }
    constructor() {
        // this.panel = vscode.window.createWebviewPanel(
        //     'swaggerUI',
        //     'swagger ui',
        //     vscode.ViewColumn.One,
        //     {}
        // )
    }
    async getChildren (element: urlItem): Promise<urlItem[]> {
        if (element) {
            if (element.configUrl) {
                const data = await this.getUrlsJson(element.configUrl)
                return data.urls.map((item:any) => {
                    return {
                        label: item.name,
                        url: element.label + item.url,
                        swaggerUi: element.label + '/swagger-ui/index.html?configUrl=' + encodeURIComponent('/v3/api-docs/swagger-config&urls.primaryName=' + item.name),
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                    }
                })
            } else if (element.url) {
                return this.getJsonInfo(element.url, element.swaggerUi || '')
            }
            return element.children || []
        }
        const result = this.getConfigSwaggerInfo()
        return [{
            label: 'swagger接口',
            children: result,
            collapsibleState: vscode.TreeItemCollapsibleState.Expanded
        }]
    }
    getTreeItem (element: urlItem): vscode.TreeItem {
        return element
    }
    openSwaggerUI (url: string) {
        vscode.env.openExternal(vscode.Uri.parse(url))
        // todo: 没找到内嵌URL的方法
        // this.panel.webview.html = `<iframe src="${url}" width="100%" height="500px"/>`
    }
    generateTs (schemas: any, fileName: string) {
        const content = this.schemas2ts(schemas)
        fs.writeFile(fileName, content, "utf-8", function (err) {
            if (err) {
                console.log(err)
                console.log("文件写入失败")
            } else {
                console.log("文件写入成功，已保存")
            }
        })
    }
    private getConfigSwaggerInfo(): any {
        // 获取swagger接口信息
        const swaggerDomains = vscode.workspace.getConfiguration('swaggerToTs').swaggerDomains
        return swaggerDomains.map((item:string) => {
            // 用于处理只写了域名，没有加/的情况
            item = item.endsWith('/') ? item.substr(0, item.length - 1) : item
            return {
                label: item,
                configUrl: item + '/v3/api-docs/swagger-config',
                collapsibleState: vscode.TreeItemCollapsibleState.Expanded
            }
        })
        
    }

    private async getJsonInfo(swaggerUrl: string, swaggerUi: string): Promise<urlItem[]> {
        let result = []
        const urlParams = await this.getUrlsJson(swaggerUrl)
        if (!urlParams) {
            return []
        }
        const children = this.resolveJson(urlParams.paths, swaggerUi)
        result.push({
            contextValue: 'businessRoot',
            label: urlParams.info.title,
            description: urlParams.info.description,
            children: children,
            collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
            schemas: urlParams.definitions || urlParams.components.schemas
        })
        return result
    }
    private async getUrlsJson(swaggerUrl: string): Promise<any> {
        try {
            const { data } = await axios.get(swaggerUrl)
            return data
        } catch (err) {
            return null
        }
    }

    private resolveJson (urlParams: any, swaggerUi: string): urlItem[] {
        let map = new Map()
        let result = []
        Object.entries(urlParams).map(([key, value]:any) => {
            Object.entries(value).map(([k, v]:any) => {
                const tag = v.tags[0]
                const obj = {
                    label: k + ' ' + key,
                    description: v.summary,
                    collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
                    command: {
                        command: 'swagger-to-typescript.openSwaggerUI',
                        arguments: [swaggerUi + '#/' + tag + '/' + v.operationId],
                        title: 'Open Swagger UI'
                    }
                }
                if (map.has(tag)) {
                    map.set(tag, map.get(tag).concat(obj))
                } else {
                    map.set(tag, [obj])
                }
            })
        })
        for (let [key, value] of map) {
            result.push({
                label: key,
                children: value,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            })
        }
        return result
    }
    private schemas2ts (schemas: any): string {
        const result = Object.entries(schemas).filter(([key, value]:any) => {
            return !!value.properties
        }).map(([key,value]:any) => {
            const properties = value.properties
            const required = value.required || []
            const propArr = Object.entries(properties).map(([k, v]:any) => {
                const type = this.switchType(v)
                if (!type) {
                    return ''
                }
                const isRequired = required.includes(k)
                const description = v.description ? v.description.replace(/\/(\*)+/gi, '').replace(/(\*)+\/$/gi, '') : ''
                console.log(description)
                return `
    /**
     * ${description}
     * @type {${type}}
     * @memberof ${key}
     */
    ${k}${isRequired ? ': ' : '?: '}${type}
`
            })
            return `
/**
* ${value.description || ''}
* @export
* @interface ${key}
*/
export interface ${key} {
    ${propArr.join('')}
}
`
        })
        return result.join('\n')
    }
    private switchType (params: any) {
        let type = params.type
        if (!type) return ''
        type = type.toLowerCase()
        const format = params.format ? params.format.toLowerCase() : ''
        const items = params.items
        if (type === 'integer') {
            type = 'number'
        } else if (type === 'string') {
            if (format === 'date-time' || format === 'date') {
                type = 'Date'
            }
        } else if (type === 'array') {
            if (items) {
                if (items.$ref) {
                    type = `Array<${items.$ref.substr(items.$ref.lastIndexOf('/') + 1)}>`
                } else if (items.type) {
                    type = `Array<${this.switchType(items)}>`
                }
            }
        }
        return type
    }
}

interface urlItem {
    contextValue?: string
	label: string
    description?: string
    // 配置Url，通过/v3/api-docs/swagger-config获取
    configUrl?: string
    // 跳转到swaggerUi页面的链接
    swaggerUi?: string
    // 实际URL
    url?: string
    children?: Array<urlItem>
    collapsibleState?: vscode.TreeItemCollapsibleState,
    command?: vscode.Command,
    schemas?: Array<any>
}
