export default {
  routes: [
    { // Path defined with a URL parameter
      method: 'GET',
      path: '/user-dailies/:date([0-9]{4}-[0-9]{2}-[0-9]{2})',
      handler: 'api::user-daily.user-daily.findOneByDate',
    },
    { // Path defined with a URL parameter
      method: 'POST',
      path: '/user-dailies/:date([0-9]{4}-[0-9]{2}-[0-9]{2})',
      handler: 'api::user-daily.user-daily.saveByDate',
    },
    { // Batched sync seed: one request fans out to every collection the
      // daily orchestrator mirrors, owner-scoped, for the given date.
      method: 'GET',
      path: '/user-dailies/aggregate/:date([0-9]{4}-[0-9]{2}-[0-9]{2})',
      handler: 'api::user-daily.user-daily.findAggregate',
    },
  ]
}