const moment = require('moment');

exports.formatDate = (date) => moment(date).format('DD-MMM-YYYY');
exports.formatTime = (time) => moment.utc(time).format('HH:mm');

// Jam sekarang (WIB, UTC+7), tidak bergantung pada zona waktu server
exports.currentJamWib = () => moment().utcOffset(7).format('HH:mm');
