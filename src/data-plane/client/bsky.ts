export class MockDataPlaneClient {
    constructor(private host: string) {}
    async xrpc(handler, {params = {}, data = null}) {
        let api = new URL(`https://${this.host}/xrpc/${handler}`)
        let searchParams = new URLSearchParams()
        for (const [key, value] of Object.entries(params)) {
            searchParams.set(key, value as any)
        }
        api.search = searchParams.toString()

        let method = 'GET'
        let headers = {}
        let body: null|string = null

        if (data) {
            method = 'POST'
            headers['Content-Type'] = 'application/json'
            body = JSON.stringify(data)
        }
        let response = await fetch(api.toString(), {headers, method, body})
        let content_type = response.headers.get('content-type') as string
        if (content_type.startsWith('application/json')) return await response.json()
        return await response.text()
    }
    async getDidsByHandles(req: {handles: string[]}) {
        let dids: string[] = []
        for (let handle of req.handles) {
            let data = await this.xrpc('com.atproto.identity.resolveHandle', {params: {handle}}) as {did: string}
            dids.push(data.did)
        }
        return {dids}
    }
}