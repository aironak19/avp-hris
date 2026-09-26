/* ==========================================================================
   AVP HRIS — deployment configuration
   --------------------------------------------------------------------------
   The only file that changes between environments. `endpoint` is the Apps
   Script web-app /exec URL; it is not a secret (the deployment is already
   reachable anonymously — every request is still authorised by the bearer
   token the API issues at sign-in), which is what makes a static public
   frontend safe here.

   After redeploying the Apps Script project as a NEW VERSION, paste the new
   /exec URL below. A new *deployment* changes the URL; a new *version* of the
   same deployment does not.
   ========================================================================== */
window.HRIS_CONFIG = {
  endpoint: 'https://script.google.com/macros/s/AKfycbxLwXDjLXuWtwM0XWhELIbYt4BCWDQEi3WGCLM-KN5PLecmiTnlJdngqXEYHaep3m0kJA/exec'
};

/* Cache-buster for the on-demand view modules. Bump on every release so
   returning browsers never mix a new shell with an old screen. */
window.HRIS_BUILD = '3.1.0';
