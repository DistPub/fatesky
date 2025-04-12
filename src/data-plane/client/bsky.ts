import { Code, ConnectError } from "@connectrpc/connect"
import { Post, PostAgg, PostAggs } from "../../hydration/feed"
import { Actor } from "../../hydration/actor"
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
        let data = await this.xrpc('app.bsky.feed.getPostThread', {params: req.params}) as any
        if (data.error === 'NotFound') throw new ConnectError(data.message, Code.NotFound)
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
            likes.push(counter?.likes)
            reposts.push(counter?.reposts)
            replies.push(counter?.replies)
            quotes.push(counter?.quotes)
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
    async getLabelerRecords({ uris }) {
        let records: any[] = []
        for (let uri of uris) {
            const [repo, collection, rkey] = uri.slice('at://'.length).split('/')
            const data = await this.xrpc('com.atproto.repo.getRecord', {params: {repo, collection, rkey}}) as any
            records.push({ record: data.value, cid: data.cid, sortedAt: new Date(0), indexedAt: new Date(0), takedownRef: undefined })
        }
        return {records}
    }
    async getBlockExistence({ pairs: deduped }) {
        let blocks: any[] = []
        for(let item of deduped) {
            blocks.push({})
        }
        return {blocks}
    }
    async getActors(req: { dids, state: HydrationState | null }) {
        const actors: any[] = []
        const lets = req.state?.actors as HydrationMap<Actor>
        for (let did of req.dids) {
            actors.push({
                ...lets.get(did),
                exists: true
            })
        }
        return {actors}
    }
    async getLikesByActorAndSubjects({
        actorDid,
        refs
      }) {
        return {uris: []}
      }
}

function lookupUri(data, state: HydrationState) {
    let uris: string[] = []
    state.posts ??= new HydrationMap<Post>()
    state.postAggs ??= new HydrationMap<PostAgg>()
    state.actors ??= new HydrationMap<Actor>()
    for (let key in data) {
        if (data.hasOwnProperty(key)) {
            let value = data[key]

            if (data.did && data.handle) {
                state.actors.set(data.did, {
                    did: data.did,
                    handle: data.did,
                    profile: data,
                    isLabeler: false,
                    priorityNotifications: false
                })
            }

            if (key === 'uri' && (data.record || data.value || data.notFound)) {
                if (data.record) uris.push(value)
                if (data.notFound) {
                    state.posts.set(value, null)
                } else {
                    state.posts.set(value, {
                        record: data.record || data.value,
                        cid: data.cid,
                        sortedAt: data.sortedAt,
                        indexedAt: data.indexedAt,
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
                }
            } else if (value !== null && typeof value === 'object') {
                uris = uris.concat(lookupUri(value, state))
            } else if (Array.isArray(value)) {
                for (let item of value) {
                    if (item !== null && typeof item === 'object') {
                        uris = uris.concat(lookupUri(item, state))
                    }
                }
            }
        }        
    }
    return uris
}
