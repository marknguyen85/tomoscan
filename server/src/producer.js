'use strict'

const q = require('./queues')
const db = require('./models')
const events = require('events')
const logger = require('./helpers/logger')

// fix warning max listener
events.EventEmitter.defaultMaxListeners = 1000
process.setMaxListeners(1000)

let sleep = (time) => new Promise((resolve) => setTimeout(resolve, time))

let countJobs = () => {
    return new Promise((resolve, reject) => {
        q.inactiveCount((err, l) => {
            if (err) {
                return reject(err)
            }
            return resolve(l)
        })
    })
}

const watch = async () => {
    const timeCycle = 2 * 60 * 1000
    try {
        let newJobSetting = await db.Setting.findOne({ meta_key: 'push_new_job' })
        if (!newJobSetting) {
            newJobSetting = await new db.Setting({
                meta_key: 'push_new_job',
                meta_value: 1
            })
            await newJobSetting.save()
        }

        while (true) {
            let l = await countJobs()
            if (l > 1) {
                logger.debug('%s jobs, sleep 60 seconds before adding more', l)
                await sleep(timeCycle)
                continue
            }
            if (String(newJobSetting.meta_value) !== '1') {
                newJobSetting = await db.Setting.findOne({ meta_key: 'push_new_job' })
                logger.debug('Setting is not allow push new job. Sleep 60 seconds and wait to allow')
                await sleep(timeCycle)
                continue
            }

            if (String(newJobSetting.meta_value) === '1') {
                // crawl data
                q.create('TradeStats', null).priority('high').removeOnComplete(true).attempts(2).backoff({ delay: timeCycle, type: 'fixed' }).save()
                await sleep(timeCycle)
            }
        }
    } catch (e) {
        logger.warn('Sleep 60 seconds before going back to work. Error %s', e)
        await sleep(timeCycle)
        return watch()
    }
}

module.exports = { watch }
// watch()
