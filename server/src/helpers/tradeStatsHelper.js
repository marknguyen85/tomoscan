'use strict'

const db = require('../models')
const logger = require('./logger')
const axios = require('axios')
const config = require('config')

let TradeStatsHelper = {
    crawlTradeStats:async () => {
        const response = await axios.get(config.get('CONST_API'))
        let result = response.data && response.data.Result ? response.data.Result : []
        const items = result.map((item) => {
            return {
                type: 'CONST',
                from: item.ReferralCode,
                volume: item.Amount
            }
        })

        // delete old data
        logger.info('crawlTradeStats delete old data from db')
        await db.TradeStats.deleteMany({ type: /CONST/ })
        // insert new data
        logger.info('crawlTradeStats insert new data from CONST API')
        await db.TradeStats.insertMany(items)

        return items
    }
}

module.exports = TradeStatsHelper
