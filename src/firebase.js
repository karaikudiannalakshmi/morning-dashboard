import { initializeApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const kalApp = initializeApp({
  apiKey: "AIzaSyDOCusASMq_ZUWwksdOGZT7WibyeMCJfKY",
  authDomain: "koviloor-payroll.firebaseapp.com",
  databaseURL: "https://koviloor-payroll-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "koviloor-payroll",
  storageBucket: "koviloor-payroll.firebasestorage.app",
  messagingSenderId: "164444642831",
  appId: "1:164444642831:web:26bc4c11522f8af4144d7a"
}, 'kal')

const propApp = initializeApp({
  apiKey: "AIzaSyCou7UrqUZ2ItYIfRgP_qANC8vHmk41Fs4",
  authDomain: "koviloor-property.firebaseapp.com",
  databaseURL: "https://koviloor-property-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "koviloor-property",
  storageBucket: "koviloor-property.firebasestorage.app",
  messagingSenderId: "1033158120765",
  appId: "1:1033158120765:web:e671abefc8b6656147a154"
}, 'prop')

const kasiApp = initializeApp({
  apiKey: "AIzaSyCz032o3ovghzuWZGEn6FGQaPmQ7mIdQ9Y",
  authDomain: "kasi-varanasi-payroll.firebaseapp.com",
  projectId: "kasi-varanasi-payroll",
  storageBucket: "kasi-varanasi-payroll.firebasestorage.app",
  messagingSenderId: "524376873360",
  appId: "1:524376873360:web:6c261b2c8ad2abd716fb15"
}, 'kasi')

const akApp = initializeApp({
  apiKey: "AIzaSyAD2fCKmZ0vP42wBAbChuZQs1NSHr0tLiE",
  authDomain: "annakshetra-bills.firebaseapp.com",
  projectId: "annakshetra-bills",
  storageBucket: "annakshetra-bills.firebasestorage.app",
  messagingSenderId: "663796063397",
  appId: "1:663796063397:web:5b04f52df825bb957e014c"
}, 'ak')

export const kalDb  = getDatabase(kalApp)
export const propDb = getDatabase(propApp)
export const kasiFs = getFirestore(kasiApp)
export const akFs   = getFirestore(akApp)
