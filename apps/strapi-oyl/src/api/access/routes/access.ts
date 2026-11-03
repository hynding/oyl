/**
 * Custom (non-content-type) route: the signed-in user's access level (`{ admin }`), which
 * the app reads to show admin-only screens (Status). camis-php-oyl mirrors it in
 * overlay/routes/api-custom.php.
 */
export default {
  routes: [
    {
      method: 'GET',
      path: '/access',
      handler: 'access.find',
      config: { policies: [] },
    },
  ],
}
