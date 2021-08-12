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
  
    /**
     * 更新数据
     */
    refresh(): void {
        this._onDidChangeTreeData.fire()
    }
    constructor() {}
    async getChildren (element: urlItem): Promise<urlItem[]> {
        if (element) {
            if (element.configUrl) {
                const data = await this.getUrlsJson(element.configUrl)
                console.log(element.configUrl)
                console.log(data)
                return (data.urls || data).map((item:any) => {
                    return {
                        label: item.name,
                        url: element.label + item.url,
                        swaggerUi: item.swaggerVersion == '2.0' ? element.label + '/swagger-ui.html?urls.primaryName=' + item.name : element.label + '/swagger-ui/index.html?configUrl=' + encodeURIComponent('/v3/api-docs/swagger-config&urls.primaryName=' + item.name),
                        collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
                    }
                })
            } else if (element.url) {
                return this.getJsonInfo(element.url, element.swaggerUi || '')
            }
            return element.children || []
        }
        /**
         * 此处是初始化展示
         */
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
    /**
     * 打开对应接口的swagger文档
     * 
     * @param url 
     */
    openSwaggerUI (url: string) {
        vscode.env.openExternal(vscode.Uri.parse(url))
        // todo: 没找到内嵌URL的方法
        // this.panel.webview.html = `<iframe src="${url}" width="100%" height="500px"/>`
    }
    generateTs (params: any, fileName: string) {
        const content = this.schemas2ts(params)
        fs.writeFile(fileName, content, "utf-8", function (err) {
            if (err) {
                console.log(err)
                console.log("文件写入失败")
            } else {
                console.log("文件写入成功，已保存")
            }
        })
    }
    /**
     * 导出api请求
     * 
     * @param params 
     * @param fileName 
     */
    generateApi (params: any, fileName: string) {
        console.log(params)
        // const content = this.schemas2ts(params)
        // fs.writeFile(fileName, content, "utf-8", function (err) {
        //     if (err) {
        //         console.log(err)
        //         console.log("文件写入失败")
        //     } else {
        //         console.log("文件写入成功，已保存")
        //     }
        // })
    }
    /**
     * 获取配置的SwaggerUrl的前缀
     * 通过swagger-config获取不同业务的请求链接
     */
    private getConfigSwaggerInfo(): any {
        // 获取swagger接口信息
        const swaggerDomains = vscode.workspace.getConfiguration('swaggerToTs').swaggerDomains
        return swaggerDomains.map((item:any) => {
            // 用于处理只写了域名，没有加/的情况
            let domain = item.domain.endsWith('/') ? item.domain.substr(0, item.domain.length - 1) : item.domain
            return {
                label: domain,
                configUrl: item.version === '3' ? domain + '/v3/api-docs/swagger-config' : domain + '/swagger-resources',
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
            schemas: urlParams.definitions || urlParams.components.schemas,
            paths: urlParams.paths
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
                contextValue: 'subBusiness',
                label: key,
                children: value,
                collapsibleState: vscode.TreeItemCollapsibleState.Collapsed
            })
        }
        return result
    }
    private schemas2ts (params: any): string {
        // 0.0.4 获取paths中的出参对应的shemas，出参中的所有属性都是必填的
        let respRef: Array<any> = []
        Object.entries(params.paths).map(([key, value]:any) => {
            // 过滤出来有$ref的response
            const result = Object.entries(value).filter(([k, v]:any) => {
                const content = v.responses[200].content
                if (content) {
                    return content['*/*'].schema.$ref || content['*/*'].schema.items.$ref
                }
                return false
            }).map(([k, v]:any) => {
                const ref = v.responses[200].content['*/*'].schema.$ref
                const index = ref.lastIndexOf('/')
                return ref.substr(index + 1)
            })
            respRef = respRef.concat(result)
        })
        const result = Object.entries(params.schemas).filter(([key, value]:any) => {
            return !!value.properties
        }).map(([key,value]:any) => {
            const properties = value.properties
            const required = value.required || []
            const propArr = Object.entries(properties).map(([k, v]:any) => {
                const type = this.switchType(v)
                if (!type) {
                    return ''
                }
                const isRequired = required.includes(k) || respRef.includes(key)
                // 0.0.4版本处理说明里面有注解符号(/**  */)的情况，容易产生语法错误
                const description = v.description ? v.description.replace(/\/(\*)+/gi, '').replace(/(\*)+\/$/gi, '') : ''
                return `
    /**
     * ${description}
     * @type {${type}}
     * @memberof ${key}
     */
    ${k}${isRequired ? ': ' : '?: '}${type}
`
            })
            // 针对内部类命名为IPage«xxx»的处理
            const displayKey = key.replace(/«|»/gi, '')
            return `
/**
* ${value.description || ''}
* @export
* @interface ${displayKey}
*/
export interface ${displayKey} {
    ${propArr.join('')}
}
`
        })
        return result.join('\n')
    }
    private switchType (params: any) {
        let type = params.type
        // 当没有type的时候的处理，查看是否有ref属性，有ref就是对应到object属性
        if (!type) {
            const ref = params.$ref
            if (ref) {
                return ref.substr(ref.lastIndexOf('/') + 1)
            }
            return ''
        }
        type = type.toLowerCase()
        const format = params.format ? params.format.toLowerCase() : ''
        const items = params.items
        if (type === 'integer' || type === 'number') {
            type = 'number | string'
        } else if (type === 'string') {
            // 0.04 版本删除这个部分，前端传递的都是string类型没有Date类型
            // if (format === 'date-time' || format === 'date') {
            //     type = 'Date'
            // }
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
    schemas?: Array<any>,
    paths?: Array<any>
}
