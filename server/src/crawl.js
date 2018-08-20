'use strict'

import Web3Util from './helpers/web3'
const config = require('config')
const q = require('./queues')
const db = require('./models')
const events = require('events')

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000
process.setMaxListeners(1000)

// let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

let watch = async () => {
    while (true) {
        let web3 = await Web3Util.getWeb3()
        let maxBlockNum = await web3.eth.getBlockNumber()
        let minBlockCrawl = await db.Setting.findOne({ meta_key: 'min_block_crawl' })
        minBlockCrawl = minBlockCrawl ? minBlockCrawl.meta_value : 0
        minBlockCrawl = parseInt(minBlockCrawl)
        if (minBlockCrawl < maxBlockNum) {
            let nextCrawl = minBlockCrawl + 20
            nextCrawl = nextCrawl < maxBlockNum ? nextCrawl : maxBlockNum
            for (let i = minBlockCrawl; i < nextCrawl; i++) {
                q.create('BlockProcess', { block: i })
                    .priority('normal').removeOnComplete(true).save()

                let setting = await db.Setting.findOne({ meta_key: 'min_block_crawl' })
                if (!setting) {
                    setting = await new db.Setting({
                        meta_key: 'min_block_crawl',
                        meta_value: 0
                    })
                }
                if (i >= parseInt(setting.meta_value)) {
                    setting.meta_value = i
                }
                await setting.save()

                // if (i !== 0 && i % 20 === 0) {
                //     console.log('Sleep 10 seconds')
                //     await sleep(10000)
                //     // console.log('process exit')
                //     // process.exit(1)
                // }
            }
        }
    }
}

try {
    watch()
} catch (e) {
    if (config.get('APP_ENV') === 'prod') {
        let slack = require('slack-notify')(config.get('SLACK_WEBHOOK_URL'))
        slack.send({
            channel: '#tm_explorer',
            text: e
        })
    }
    console.trace(e)
    console.log(e)
}
