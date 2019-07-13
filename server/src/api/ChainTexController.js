const { Router } = require('express')
const db = require('../models')
const TransactionHelper = require('../helpers/transaction')
const Web3Util = require('../helpers/web3')
const config = require('config')
const redisHelper = require('../helpers/redis')
const BigNumber = require('bignumber.js')

const accountName = require('../contracts/accountName')
const logger = require('../helpers/logger')
const { check, validationResult } = require('express-validator/check')

const ChainTexController = Router()

ChainTexController.get('/chaintex/volume', [
    check('fromDate').optional().isString().withMessage('require from date is yyyy-mm-dd'),
    check('toDate').optional().isString().withMessage('require to date is yyyy-mm-dd')
], async (req, res) => {
    let errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let params = { query: {} }
    try {
        let fromDate = req.query.fromDate
            ? new Date(`${req.query.fromDate}T00:00:01.000Z`)
            : new Date('2019-01-01T00:00:01.000Z')
        let toDate = req.query.toDate
            ? new Date(`${req.query.toDate}T23:59:59.000Z`)
            : new Date()
        // add 1 day for toDate
        toDate = new Date(toDate.setDate(toDate.getDate() + 1))
        let address = config.get('CHAINTEX_ADDR')
        const keyCached = `vol-${address}-${req.query.fromDate}-${req.query.toDate}`
        // load from cached
        let cache = await redisHelper.get(keyCached)
        if (cache !== null) {
            let r = JSON.parse(cache)
            logger.info('load volume of address %s from cached', address)
            return res.json(r)
        }

        params.query = Object.assign({}, params.query,
            { isPending: false,
                to: address,
                timestamp: { $gte: fromDate, $lte: toDate }
            })

        let avg = [
            { $match: params.query },
            { $group: {
                _id: { address: '$to' },
                volume: {
                    $sum: '$realValue'
                }
            } }
        ]

        let items = await db.Tx.aggregate(avg).exec()

        let volume = 0
        if (items && items.length > 0) {
            volume = new BigNumber(items[0].volume).dividedBy(10 ** 18).toNumber()
        }

        let data = {
            volume,
            from: fromDate,
            to: toDate,
            time: new Date()
        }
        if (volume > 0) {
            const expỉreTime = 1 * 60// 1 minutes
            redisHelper.set(keyCached, JSON.stringify(data), expỉreTime)
        }

        return res.json(data)
    } catch (e) {
        logger.warn('cannot get list tx with query %s. Error', JSON.stringify(params.query), e)
        return res.status(500).json({ errors: { message: 'Something error!' } })
    }
})

ChainTexController.get('/chaintex/volume24h', async (req, res) => {
    let errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let params = { query: {} }
    try {
        const now = new Date()
        let fromDate = new Date(`${now.getFullYear()}${now.getMonth()}${now.getDate()}T00:00:01.000Z`)
        let toDate = new Date(`${now.getFullYear()}${now.getMonth()}${now.getDate()}T59:59:59.000Z`)
        let address = config.get('CHAINTEX_ADDR')
        const keyCached = `vol24h-${address}`
        // load from cached
        let cache = await redisHelper.get(keyCached)
        if (cache !== null) {
            let r = JSON.parse(cache)
            logger.info('load trade stats of address %s from cache', address)
            return res.json(r)
        }

        params.query = Object.assign({}, params.query,
            { isPending: false,
                to: address,
                timestamp: { $gte: fromDate, $lte: toDate }
            })

        let avg = [
            { $match: params.query },
            { $group: {
                _id: { address: '$to' },
                volume: {
                    $sum: '$realValue'
                }
            } }
        ]

        let items = await db.Tx.aggregate(avg).exec()

        let volume = 0
        if (items && items.length > 0) {
            volume = new BigNumber(items[0].volume).dividedBy(10 ** 18).toNumber()
        }

        let data = {
            volume,
            from: fromDate,
            to: toDate,
            time: new Date()
        }
        if (volume > 0) {
            const expỉreTime = 30// 30 seconds
            redisHelper.set(keyCached, JSON.stringify(data), expỉreTime)
        }

        return res.json(data)
    } catch (e) {
        logger.warn('cannot get list tx with query %s. Error', JSON.stringify(params.query), e)
        return res.status(500).json({ errors: { message: 'Something error!' } })
    }
})

ChainTexController.get('/chaintex/conststats', [
    check('limit').optional().isInt({ max: 100 }).withMessage('Limit is less than 101 items per page'),
    check('page').optional().isInt({ max: 500 }).withMessage('Require page is number')
], async (req, res) => {
    let errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        let perPage = !isNaN(req.query.limit) ? parseInt(req.query.limit) : 25
        let page = !isNaN(req.query.page) ? parseInt(req.query.page) : 1
        let offset = page > 1 ? (page - 1) * perPage : 0
        const keyCached = `txs-conststats`
        if (page === 1) {
            // load from cached
            let cache = await redisHelper.get(keyCached)
            if (cache !== null) {
                let r = JSON.parse(cache)
                logger.info('load trade stats of constant from cache')
                return res.json(r)
            }
        }

        let total = await db.TradeStats.count({ type: 'CONST' }).exec()
        if (total === 0) {
            return res.json({
                total: total,
                perPage: perPage,
                currentPage: page,
                pages: 0,
                items: []
            })
        }

        let pages = Math.ceil(total / perPage)
        let items = await db.TradeStats.find({ type: 'CONST' })
            .maxTimeMS(20000)
            .sort({ volume: -1 })
            .skip(offset)
            .limit(perPage)
            .lean()
            .exec()

        if (pages > 500) {
            pages = 500
        }

        let data = {
            total: total,
            perPage: perPage,
            currentPage: page,
            pages: pages,
            items: mapFromTradeStats(items)
        }

        if (page === 1 && data.items.length > 0) {
            const expỉreTime = 10
            redisHelper.set(keyCached, JSON.stringify(data), expỉreTime)
        }
        return res.json(data)
    } catch (e) {
        console.log(e)
        return res.status(500).json({ errors: { message: 'Something error!' } })
    }
})

ChainTexController.get('/chaintex/tradestats', [
    check('limit').optional().isInt({ max: 100 }).withMessage('Limit is less than 101 items per page'),
    check('page').optional().isInt({ max: 500 }).withMessage('Require page is number'),
    check('minValue').optional().isInt().withMessage('Require page is number'),
    check('sort').optional().isString().withMessage('type = volume|txs'),
    check('fromDate').optional().isString().withMessage('require from date is yyyy-mm-dd'),
    check('toDate').optional().isString().withMessage('require to date is yyyy-mm-dd')
], async (req, res) => {
    let errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let params = { sort: { volume: -1 }, query: {} }
    const viewActive = req.query.sort
    if (viewActive === 'txs') {
        params.sort = { txs: -1 }
    } else {
        params.sort = { volume: -1 }
    }

    try {
        let fromDate = req.query.fromDate ? new Date(req.query.fromDate) : new Date()
        let toDate = req.query.toDate ? new Date(req.query.toDate) : new Date()
        // add 1 day for toDate
        toDate = new Date(toDate.setDate(toDate.getDate() + 1))

        let minValue = !isNaN(req.query.minValue) ? +req.query.minValue : 0
        let perPage = !isNaN(req.query.limit) ? parseInt(req.query.limit) : 25
        let page = !isNaN(req.query.page) ? parseInt(req.query.page) : 1
        let offset = page > 1 ? (page - 1) * perPage : 0
        let address = config.get('CHAINTEX_ADDR')
        const keyCached = `txs-tradestats-${address}-${viewActive}-${perPage}`
        if (page === 1) {
            // load from cached
            let cache = await redisHelper.get(keyCached)
            if (cache !== null) {
                let r = JSON.parse(cache)
                logger.info('load trade stats of address %s from cache', address)
                return res.json(r)
            }
        }

        params.query = Object.assign({}, params.query,
            { isPending: false,
                to: address,
                realValue: { $gte: minValue },
                timestamp: { $gte: fromDate, $lte: toDate }
            })
        console.log('+++++++++++++++++++++++++++++', params.query)
        let grp = [
            { $match: params.query },
            { $group: {
                _id: { from: '$from' }
            } },
            { $count: 'passing_scores' }
        ]

        let all = await db.Tx.aggregate(grp).exec()
        let total = all && all.length > 0 ? all[0].passing_scores : 0

        if (total === 0) {
            return res.json({
                total: total,
                perPage: perPage,
                currentPage: page,
                pages: 0,
                items: []
            })
        }
        let pages = Math.ceil(total / perPage)
        let avg = [
            { $match: params.query },
            { $group: {
                _id: { from: '$from' },
                volume: {
                    $sum: {
                        $toDouble : '$realValue'
                    }
                },
                txs: { $sum: 1 }
            } },
            { $sort: params.sort },
            { $limit: perPage },
            { $skip: offset }
        ]

        let items = await db.Tx.aggregate(avg).exec()

        if (pages > 500) {
            pages = 500
        }

        let data = {
            total: total,
            perPage: perPage,
            currentPage: page,
            pages: pages,
            items: mapFromGroup(items)
        }

        if (page === 1 && data.items.length > 0) {
            const expỉreTime = 10
            redisHelper.set(keyCached, JSON.stringify(data), expỉreTime)
        }
        return res.json(data)
    } catch (e) {
        console.log(e)
        logger.warn('cannot get list tx with query %s. Error', JSON.stringify(params.query), e)
        return res.status(500).json({ errors: { message: 'Something error!' } })
    }
})

const mapFromTradeStats = (items) => {
    return items.map((item) => {
        return {
            from: item.from,
            volume: item.volume,
            txs: item.txs
        }
    })
}

const mapFromGroup = (items) => {
    return items.map((item) => {
        return {
            from: item._id.from,
            volume: item.volume,
            txs: item.txs
        }
    })
}
ChainTexController.get('/chaintex/latestTrade', [
    check('limit').optional().isInt({ max: 100 }).withMessage('Limit is less than 101 items per page'),
    check('page').optional().isInt({ max: 500 }).withMessage('Require page is number')
], async (req, res) => {
    let errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    let params = { sort: { blockNumber: -1 }, query: {} }
    let start = new Date()
    try {
        let perPage = !isNaN(req.query.limit) ? parseInt(req.query.limit) : 25
        let page = !isNaN(req.query.page) ? parseInt(req.query.page) : 1
        let offset = page > 1 ? (page - 1) * perPage : 0

        let address = config.get('CHAINTEX_ADDR')
        let specialAccount = null
        let total = null
        let txAccount = req.query.tx_account

        specialAccount = await db.SpecialAccount.findOne({ hash: 'transaction' })
        total = specialAccount ? specialAccount.total : 0
        params.query = Object.assign({}, params.query, { isPending: false })

        if (total === null) {
            let sa = await db.Account.findOne({ hash: address })
            if (sa) {
                if (txAccount === 'in') {
                    total = sa.inTxCount || 0
                } else if (txAccount === 'out') {
                    total = sa.outTxCount || 0
                } else {
                    total = sa.totalTxCount || 0
                }
            }
        }

        let end = new Date() - start
        logger.info(`Txs preparation execution time: %dms`, end)
        start = new Date()
        if (total === null) {
            total = 0 // await db.Tx.countDocuments(params.query)
            end = new Date() - start
            logger.info(`Txs count execution time: %dms query %s`, end, JSON.stringify(params.query))
        }
        start = new Date()

        const web3 = await Web3Util.getWeb3()
        let data = {}
        end = new Date() - start
        logger.info(`Txs isBlock execution time: %dms`, end)
        start = new Date()
        let pages = Math.ceil(total / perPage)

        let items = await db.Tx.find(params.query)
            .maxTimeMS(20000)
            .sort(params.sort)
            .skip(offset).limit(perPage)
            .lean().exec()

        if (pages > 500) {
            pages = 500
        }

        data = {
            total: total,
            perPage: perPage,
            currentPage: page,
            pages: pages,
            items: items
        }
        end = new Date() - start
        logger.info(`Txs getOnChain === false execution time: %dms address %s query %s sort %s %s %s`,
            end, address,
            JSON.stringify(params.query),
            JSON.stringify(params.sort),
            offset, perPage)
        start = new Date()

        let listAddress = []
        for (let i = 0; i < data.items.length; i++) {
            let item = data.items[i]
            if (!listAddress.includes(item.from)) {
                listAddress.push(item.from)
            }
            if (item.to && !listAddress.includes(item.to)) {
                listAddress.push(item.to)
            }
        }
        if (listAddress) {
            let newItem = []
            let accounts = await db.Account.find({ hash: { $in: listAddress } })
            let map1 = data.items.map(async function (d) {
                let map2 = accounts.map(async function (ac) {
                    ac = ac.toJSON()
                    ac.accountName = accountName[ac.hash] || null
                    if (d.from === ac.hash) {
                        d.from_model = ac
                    }
                    if (d.to === ac.hash) {
                        d.to_model = ac
                    }
                })
                await Promise.all(map2)
                newItem.push(d)
            })
            await Promise.all(map1)
            data.items = newItem
        }
        let status = []
        for (let i = 0; i < data.items.length; i++) {
            if (!data.items[i].hasOwnProperty('status')) {
                status.push({ hash: data.items[i].hash })
            }
        }
        if (status.length > 0) {
            let map = status.map(async function (s) {
                let receipt = await TransactionHelper.getTransactionReceipt(s.hash)
                if (receipt) {
                    let status
                    if (typeof receipt.status === 'boolean') {
                        status = receipt.status
                    } else {
                        status = web3.utils.hexToNumber(receipt.status)
                    }
                    s.status = status
                } else {
                    s.status = null
                }
            })
            await Promise.all(map)
            for (let i = 0; i < status.length; i++) {
                for (let j = 0; j < data.items.length; j++) {
                    if (status[i].hash === data.items[j].hash) {
                        data.items[j].status = status[i].status
                    }
                }
            }
        }
        end = new Date() - start
        logger.info(`Txs getOnChain execution time: %dms address %s`, end, address)
        if (page === 1 && address && data.items.length > 0) {
            redisHelper.set(`txs-${txAccount}-${address}`, JSON.stringify(data))
        }
        return res.json(mapData(data))
    } catch (e) {
        logger.warn('cannot get list tx with query %s. Error', JSON.stringify(params.query), e)
        return res.status(500).json({ errors: { message: 'Something error!' } })
    }
})

var mapData = function (data) {
    if (!data || !data.items) {
        return {
            total: data.total,
            perPage: data.perPage,
            currentPage: data.currentPage,
            pages: data.pages,
            items: []
        }
    }
    logger.info('aaaaaaa', data)
    const items = data.items.map((item) => {
        const fromModel = item.from_model || {}
        const toModel = item.to_model || {}
        return {
            createdAt: item.createdAt,
            value: item.value,
            from: item.from,
            to: item.to,
            from_model: {
                status: fromModel.status,
                balance: fromModel.balance,
                balanceNumber: fromModel.balanceNumber,
                isToken: fromModel.isToken,
                accountName: fromModel.accountName
            },
            to_model: {
                status: toModel.status,
                balance: toModel.balance,
                balanceNumber: toModel.balanceNumber,
                isContract: toModel.isContract,
                isToken: toModel.isToken,
                accountName: toModel.accountName
            }
        }
    })
    return {
        total: data.total,
        perPage: data.perPage,
        currentPage: data.currentPage,
        pages: data.pages,
        items: items
    }
}

module.exports = ChainTexController
