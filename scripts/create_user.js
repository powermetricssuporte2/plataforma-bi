// Uso: node scripts/create_user.js email senha cliente_id
// Requer GOOGLE_APPLICATION_CREDENTIALS ou gcloud ADC com acesso ao projeto Firebase.
const admin = require("firebase-admin");
admin.initializeApp();

const [email, senha, cliente] = process.argv.slice(2);
if (!email || !senha || !cliente) {
  console.error("Uso: node scripts/create_user.js <email> <senha> <cliente_id>");
  process.exit(1);
}
(async () => {
  let user;
  try {
    user = await admin.auth().getUserByEmail(email);
  } catch {
    user = await admin.auth().createUser({ email, password: senha });
  }
  await admin.auth().setCustomUserClaims(user.uid, { cliente_id: cliente });
  console.log(`OK: ${email} -> cliente ${cliente}`);
  process.exit(0);
})();
