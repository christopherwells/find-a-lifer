// Script to check IndexedDB contents
async function checkIndexedDB() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('find-a-lifer-db', 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const tx = db.transaction(['lifeList'], 'readonly');
  const store = tx.objectStore('lifeList');
  const all = await new Promise((resolve) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
  });

  console.log('=== IndexedDB Life List Contents ===');
  console.log('Total entries:', all.length);
  all.forEach(entry => {
    console.log(`- ${entry.comName} (${entry.speciesCode})`);
    console.log(`  dateAdded: ${new Date(entry.dateAdded).toISOString()}`);
    console.log(`  source: ${entry.source}`);
  });

  return all;
}

checkIndexedDB();
