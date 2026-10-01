/**
 * Jest cannot parse this package's React Native entry. These are the compiled
 * official status helpers, not a local copy of the code strings.
 */
const types = require('../../node_modules/react-native-nitro-google-signin/lib/commonjs/types.js');

const GoogleOneTapSignIn = {
  configure: jest.fn(),
  checkPlayServices: jest.fn(),
  signIn: jest.fn(),
  createAccount: jest.fn(),
  presentExplicitSignIn: jest.fn(),
};

module.exports = {
  GoogleOneTapSignIn,
  isCancelledResponse: types.isCancelledResponse,
  isErrorWithCode: types.isErrorWithCode,
  isNoSavedCredentialFoundResponse: types.isNoSavedCredentialFoundResponse,
  isSuccessResponse: types.isSuccessResponse,
  statusCodes: types.statusCodes,
};
