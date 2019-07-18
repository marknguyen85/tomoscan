'use strict'

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const Setting = new Schema({
    meta_key: { type: String, unique: true, index: true },
    meta_value: String,
    meta_pages: { type: Number },
}, {
    versionKey: false
})

module.exports = mongoose.model('Setting', Setting)
