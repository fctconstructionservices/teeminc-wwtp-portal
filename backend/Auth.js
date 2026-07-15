/**
 * ============================================
 * FILE: Auth.gs
 * PURPOSE: User authentication (login, token generation).
 * DEPENDENCIES: SheetService.gs, Config.gs
 * ============================================
 */

/**
 * Authenticate user by email/username and password.
 * @param {string} username - User's email or username.
 * @param {string} password - User's password.
 * @returns {object} { success: boolean, user: object|null, message: string }
 */
function authenticateUser(username, password) {
  var users = getSheetData(SHEETS.USERS);
  if (!users || users.length === 0) {
    return { success: false, message: 'No users found. Please set up the Users sheet.' };
  }
  
  // Hanapin ang user (case-insensitive)
  var foundUser = null;
  for (var i = 0; i < users.length; i++) {
    var u = users[i];
    if (u.Email && u.Email.toLowerCase() === username.toLowerCase()) {
      foundUser = u;
      break;
    }
    if (u.Username && u.Username.toLowerCase() === username.toLowerCase()) {
      foundUser = u;
      break;
    }
  }
  
  if (!foundUser) {
    return { success: false, message: 'User not found.' };
  }
  
  // WARNING: For production, use proper hashing (bcrypt) pero sa GAS limited.
  // Assuming plaintext for now, but better to match exactly as stored.
  if (foundUser.Password === password) {
    // Generate a simple token (for demo/session purpose)
    var token = Utilities.base64Encode(username + ':' + new Date().getTime());
    return {
      success: true,
      message: 'Login successful.',
      user: {
        name: foundUser.Name || foundUser.Username || username,
        email: foundUser.Email || username,
        role: foundUser.Role || 'User'
      },
      token: token
    };
  } else {
    return { success: false, message: 'Invalid password.' };
  }
}