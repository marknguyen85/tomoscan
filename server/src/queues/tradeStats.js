'use strict'

const TradeStatsHelper = require('../helpers/tradeStatsHelper')
const logger = require('../helpers/logger')

const consumer = {}
consumer.name = 'TradeStats'
consumer.processNumber = 1
consumer.enabled = true
consumer.task = async function (job, done) {
    try {
        logger.info('*************************************Process crawl trade stats')
        logger.info('**************************************************************')
        logger.info('**************************************************************')
        await TradeStatsHelper.crawlTradeStats()
    } catch (e) {
        logger.warn('Process crawl trade stats error: ', e)
        return done(e)
    }

    return done()
}

module.exports = consumer
