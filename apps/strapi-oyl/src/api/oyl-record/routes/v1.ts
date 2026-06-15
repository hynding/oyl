export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list' },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne' },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert' },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove' },
    { method: 'POST', path: '/v1/:collection', handler: 'oyl-record.batch' },
  ],
}
