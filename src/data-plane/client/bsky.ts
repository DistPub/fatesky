import { Post, PostAgg, PostAggs } from "../../hydration/feed"
import { HydrationState } from "../../hydration/hydrator"
import { HydrationMap } from "../../hydration/util"

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
    async getThread(req: {params: any, state: HydrationState}) {
        let data = await this.xrpc('app.bsky.feed.getPostThread', {params: req.params})
        return {uris: lookupUri(data, req.state)}
    }
    async getInteractionCounts(req: { refs: any, state: HydrationState }) {
        let likes: number[] = []
        let reposts: number[] = []
        let replies: number[] = []
        let quotes: number[] = []
        let postAggs = req.state.postAggs as PostAggs
        for (let {uri} of req.refs) {
            const counter = postAggs.get(uri) as PostAgg
            likes.push(counter.likes)
            reposts.push(counter.reposts)
            replies.push(counter.replies)
            quotes.push(counter.quotes)
        }
        return { likes, reposts, replies, quotes }
    }
    async getLabels({subjects, issuers}) {
        const uriPatterns = [...new Set(subjects)]
        const sources = [...new Set(issuers)]
        const limit = 250
        const data = await this.xrpc('com.atproto.label.queryLabels', {params: {uriPatterns, sources, limit}}) as {labels: any[]}
        return {labels: data.labels}
    }
}

function lookupUri(data, state: HydrationState) {
    let uris: string[] = []
    state.posts ??= new HydrationMap<Post>()
    state.postAggs ??= new HydrationMap<PostAgg>()
    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            let value = data[key]

            if (key === 'uri' && data.record) {
                uris.push(value)
                state.posts.set(value, {
                    record: data.record,
                    cid: data.cid,
                    sortedAt: data.sortedAt,
                    indexedAt: data.indexAt,
                    takedownRef: undefined,
                    violatesThreadGate: false,
                    violatesEmbeddingRules: false,
                    hasThreadGate: false,
                    hasPostGate: false,
                })
                state.postAggs.set(value, {
                    likes: data.likeCount,
                    replies: data.replyCount,
                    reposts: data.repostCount,
                    quotes: data.quoteCount,
                })
            } else if (value !== null && typeof value === 'object') {
                uris = uris.concat(lookupUri(value, state))
            } else if (Array.isArray(value)) {
                for (let item of value) {
                    if (item !== null && typeof item === 'object') {
                        lookupUri(item, state)
                    }
                }
            }
        }        
    }
    return uris
}
