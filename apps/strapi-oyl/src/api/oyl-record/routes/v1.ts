export default {
  routes: [
    { method: 'GET',    path: '/v1/:collection',     handler: 'oyl-record.list',    config: { auth: false } },
    { method: 'GET',    path: '/v1/:collection/:id',  handler: 'oyl-record.findOne', config: { auth: false } },
    { method: 'PUT',    path: '/v1/:collection/:id',  handler: 'oyl-record.upsert',  config: { auth: false } },
    { method: 'DELETE', path: '/v1/:collection/:id',  handler: 'oyl-record.remove',  config: { auth: false } },
  ],
}
