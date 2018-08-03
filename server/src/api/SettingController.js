import { Router } from 'express'
import axios from 'axios'
import db from "../models"
const config = require('config')

const SettingController = Router()

SettingController.get('/setting', async (req, res, next) => {
    try {
    // Get total blocks in db.
        let totalBlock = await db.Block.find().count()
        let totalAddress = await db.Account.find({ status: true }).count()
        let totalToken = await db.Token.find({ status: true }).count()
        let totalSmartContract = await db.Contract.find().count()
        let lastBlock = await db.Block.findOne().sort({ number: -1 })

        return res.json(
            {
                stats: { totalBlock, totalAddress, totalToken, totalSmartContract, lastBlock }
            })
    } catch (e) {
        console.trace(e)
        console.log(e)
        return res.status(500).send()
    }
})

SettingController.get('/setting/usd', async (req, res, next) => {
    try {
        let { data } = await axios.get('https://api.coinmarketcap.com/v2/ticker/' +
            config.get('CMC_ID') + '/?convert=USD')

        return res.json(data)
    } catch (e) {
        console.trace(e)
        console.log(e)
        return res.status(500).send()
    }
})

export default SettingController
