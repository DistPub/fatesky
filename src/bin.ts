import dotenv from 'dotenv'
dotenv.config()

import { ServerConfig } from "./config"
import BskyAppView from "./index"
import { Secp256k1Keypair } from '@atproto/crypto'

const run = async () => {
    const serviceKeypair = await Secp256k1Keypair.create()
    const config = ServerConfig.readEnv()
    const server = BskyAppView.create({
        config,
        signingKey: serviceKeypair,
    })
    await server.start()
    console.log(
        `🤖 running appview at http://localhost:${server.ctx.cfg.port}`,
    )
}

run()