/* elaya-cast.js — the people who appear in more than one surface.
 *
 * Load BEFORE elaya-store.js: the store reads window.ELAYA_CAST when it seeds.
 *
 * Only bridge people live here. Each surface keeps its own bulk seed for
 * volume and for the scenarios it is tuned to demonstrate — replacing those
 * with one shared dataset would destroy them.
 */
(function () {
  'use strict';

  window.ELAYA_CAST = {
    LOCALITY: 'Batangas City, Batangas',

    people: {
      // Welfare chain: /custody officer confirms -> /app family sees.
      miguel: {
        id: 'miguel',
        name: 'Miguel Andres R.',
        full: 'Miguel Andres Reyes',
        initials: 'MA',
        age: 24,
        facility: 'Batangas City District Jail',
        agency: 'BJMP',
        barangay: 'Kumintang Ibaba',
        guardian: 'Rosa Andres Reyes',
        guardianPhone: '+63 917 ••• 4567'
      },

      // Attendance chain: /sessions logs -> /app, /cases, /kiosk reflect it.
      jomar: {
        id: 'jomar',
        name: 'Jomar C.',
        full: 'Jomar Cruz',
        initials: 'JC',
        age: 16,
        facility: 'Bahay Pag-asa, Batangas City',
        agency: 'LSWDO',
        barangay: 'Alangilan',
        guardian: 'Rosa Andres Reyes',
        guardianPhone: '+63 917 ••• 4567'
      },

      // Already duplicated by hand in sessions.html and cases.html.
      // Promoting that duplicate to one record is the point of this file.
      renz: {
        id: 'renz',
        name: 'Bautista, Renz A.',
        full: 'Renz A. Bautista',
        initials: 'RB',
        age: 16,
        facility: 'Bahay Pag-asa, Batangas City',
        agency: 'LSWDO',
        barangay: 'Balagtas',
        guardian: 'Mrs. Editha Bautista',
        guardianPhone: '0917 445 2210'
      }
    }
  };
})();
