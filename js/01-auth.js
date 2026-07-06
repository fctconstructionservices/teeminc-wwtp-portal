        // ================================================================
        //  USER DATABASE & ROLE MANAGEMENT
        // ================================================================

        const USER_DB = {
            'admin@fctc.com': {
                name: 'Administrator',
                role: 'admin',
                password: 'admin123',
                label: 'Admin'
            },
            'glenn@fctc.com': {
                name: 'Glenn Cariaso',
                role: 'approver',
                password: 'glenn123',
                label: 'Approver'
            },
            'darwin@fctc.com': {
                name: 'Darwin Fabon',
                role: 'approver',
                password: 'darwin123',
                label: 'Approver'
            },
            'andrei@fctc.com': {
                name: 'Andrei Capunitan',
                role: 'approver',
                password: 'andrei123',
                label: 'Approver'
            },
            'maria@fctc.com': {
                name: 'Maria Santos',
                role: 'approver',
                password: 'maria123',
                label: 'Approver'
            }
        };

        // Any email not in USER_DB gets role 'request-only'
        // Password is not checked for request-only users (any password works)

        const ROLE_LABELS = {
            'admin': 'Administrator',
            'approver': 'Approver',
            'request-only': 'Request Only'
        };

