/**
 * Custom (non-content-type) route: one GET returning every backed collection for the
 * signed-in user, so the client boots with a single round trip instead of ~a dozen.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/bootstrap',
      handler: 'bootstrap.find',
      config: { policies: [] },
    },
  ],
}
