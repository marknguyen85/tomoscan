'use strict'

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Setting = new Schema({
    meta_key: String,
    meta_value: String,
    meta_pages: { type: Number }
}, {
    versionKey: false
})

module.exports = mongoose.model('Setting', Setting)
