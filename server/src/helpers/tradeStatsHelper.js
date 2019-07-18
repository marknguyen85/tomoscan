'use strict'

const db = require('../models')
const logger = require('./logger')
const axios = require('axios')
const config = require('config')
const utils = require('./utils')

let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))
let TradeStatsHelper = {
    crawlTradeStats:async () => {
        TradeStatsHelper.crawlerFromConstant()
        TradeStatsHelper.crawlerFromTomoApi()
    },
    crawlerFromConstant:async () => {
        try {
            const response = await axios.get(config.get('CONST_API'))
            let result = response.data && response.data.Result ? response.data.Result : []
            const items = result.map((item) => {
                return {
                    type: 'CONST',
                    from: item.ReferralCode,
                    volume: item.Amount
                }
            })

            await db.TradeStats.deleteMany({ type: /CONST/ })
            // insert new data
            logger.info('************************************* insert %s records from CONST API', items.length)
            await db.TradeStats.insertMany(items)
        } catch (error) {
            logger.error('sync from constants got error: ', error)
        }
    },
    getTotalPage:async () => {
        const address = config.get('CHAINTEX_ADDR')
        let url = config.get('TOMO_SCAN_TXES_SYNC') + `?address=${address}&tx_account=in&page=2&limit=1`
        const response = await axios.get(url)
        const total = response.data ? response.data.total : 0
        const perPage = parseInt(config.get('TOMO_SCAN_TXES_SYNC_RECORDS'))
        return Math.ceil(total / perPage)
    },
    getAmountFromInternal:async (hash) => {
        const url = config.get('TOMO_SCAN_TX_DETAIL') + hash
        const responseApi = await axios.get(url)
        let internalTx = []
        if (responseApi && responseApi.data) {
            internalTx = responseApi.data.internals
        }
        let value = '0'
        if (!internalTx || internalTx.length === 0) {
            return value
        }
        for (let index = 0; index < internalTx.length; index++) {
            const element = internalTx[index]
            return element.value// get value of the first element
        }
    },
    crawlerFromTomoApi:async () => {
        try {
            const totalPages = await TradeStatsHelper.getTotalPage()
            if (totalPages === 0) {
                return
            }
            logger.info('***************************have %s pages', totalPages)
            let pageSync = 1
            let setting = await db.Setting.findOne({ meta_key: 'txs_tomo_api_page_sync' })
            if (!setting) {
                setting = await new db.Setting({
                    meta_key: 'txs_tomo_api_page_sync',
                    meta_value: totalPages,
                    meta_pages: totalPages
                })
                pageSync = setting.meta_value
            } else {
                if (totalPages > setting.meta_pages) {
                    const diff = totalPages - setting.meta_pages
                    setting.meta_pages = totalPages
                    setting.meta_value = setting.meta_value + diff
                    pageSync = setting.meta_value - 1
                } else {
                    pageSync = setting.meta_value - 1
                }
            }

            if (pageSync <= 0) {
                return
            }
            logger.info('***************************start sync page %s', pageSync)
            const perPage = parseInt(config.get('TOMO_SCAN_TXES_SYNC_RECORDS'))
            const address = config.get('CHAINTEX_ADDR')
            let url = config.get('TOMO_SCAN_TXES_SYNC') + `?address=${address}&tx_account=in&page=${pageSync}&limit=${perPage}`
            const response = await axios.get(url)
            let result = response.data && response.data.items ? response.data.items : []
            if (!result || result.length === 0) {
                return
            }
            let items = []
            let willSleep = false
            for (let index = 0; index < result.length; index++) {
                const tx = result[index]
                if (tx.i_tx > 0) {
                    tx.internalValue = await TradeStatsHelper.getAmountFromInternal(tx.hash)
                    willSleep = true
                } else {
                    willSleep = false
                }

                // console.log('@@@@@@@@@@@@@@@ value: %s and internalValue %s', tx.value, tx.internalValue)
                tx.realValue = await utils.toNumber(tx.value)
                if (tx.realValue === 0) {
                    tx.realValue = await utils.toNumber(tx.internalValue)
                }

                delete tx['_id']
                items.push(tx.hash)
                await db.Tx.findOneAndUpdate({ hash: tx.hash }, tx,
                    { upsert: true, new: true, useFindAndModify: false })
                if (willSleep) {
                    sleep(1000)
                }
            }
            // insert new data
            logger.info('********************crawlerFromTomoApi insert %s records from TOMO API', items.length)
            setting.meta_value = pageSync
            await setting.save()
        } catch (error) {
            logger.error('sync from tomo api got error: ', error)
        }
    }
}

module.exports = TradeStatsHelper
