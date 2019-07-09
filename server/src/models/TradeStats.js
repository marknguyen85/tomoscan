'use strict'

const mongoose = require('mongoose')
const Schema = mongoose.Schema

const TradeStats = new Schema({
    type: { type: String }, // CONST, ....
    from: { type: String },
    volume: Number
}, {
    timestamps: true,
    toObject: { virtuals: true },
    toJSON: { virtuals: true }
})

module.exports = mongoose.model('TradeStats', TradeStats)
