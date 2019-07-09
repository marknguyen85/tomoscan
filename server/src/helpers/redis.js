const config = require('config')
const redis = require('redis')
const util = require('util')

const client = redis.createClient({
    host: config.get('redis.host'),
    port: config.get('redis.port'),
    // password: config.get('redis.password'),
    prefix: 'AccountCache-'
})
// default expiry time is 2 hours
const DEFAULT_EXPIRY_TIME = 2 * 60 * 60
let RedisHelper = {
    set: async (name, value, expiry) => {
        // will expiry in 2 hours if expiry null
        expiry = expiry || DEFAULT_EXPIRY_TIME
        await client.set(name, value, 'EX', expiry)
    },
    get: async (name) => {
        const getAsync = util.promisify(client.get).bind(client)
        return getAsync(name)
    }
}

module.exports = RedisHelper
