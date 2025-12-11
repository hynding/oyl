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
  ]
}