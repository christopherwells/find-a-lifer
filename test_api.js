async function testWeeks() {
  try {
    // Test week 52
    const res52 = await fetch('http://localhost:8000/api/weeks/52');
    const data52 = await res52.json();
    console.log('Week 52 - Array:', Array.isArray(data52), 'Length:', data52.length);
    if (data52.length > 0) {
      console.log('Fields:', Object.keys(data52[0]));
      const hasFields = ['cell_id', 'species_id', 'probability'].every(k => k in data52[0]);
      console.log('Has required fields:', hasFields);
      console.log('Prob in range:', data52[0].probability >= 0 && data52[0].probability <= 1);
    }

    // Test week 26
    const res26 = await fetch('http://localhost:8000/api/weeks/26');
    const data26 = await res26.json();
    console.log('Week 26 - Array:', Array.isArray(data26), 'Length:', data26.length);
    if (data26.length > 0) {
      const hasFields = ['cell_id', 'species_id', 'probability'].every(k => k in data26[0]);
      console.log('Has required fields:', hasFields);
    }

    // Test week 53 (invalid)
    const res53 = await fetch('http://localhost:8000/api/weeks/53');
    console.log('Week 53 HTTP Status:', res53.status);
    const text53 = await res53.text();
    console.log('Week 53 Response:', text53.substring(0, 100));
  } catch (err) {
    console.error('Error:', err);
  }
}

testWeeks();
