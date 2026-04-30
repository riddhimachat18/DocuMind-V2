import admin from "firebase-admin";
admin.initializeApp();
const db = admin.firestore();

async function check() {
  // Check total snippets regardless of field values
  const all = await db.collection("snippets").limit(5).get();
  console.log(`Total snippets (first 5): ${all.size}`);
  
  if (all.size > 0) {
    console.log("Sample document fields:");
    console.log(JSON.stringify(all.docs[0].data(), null, 2));
  } else {
    console.log("snippets collection is completely empty");
  }

  // Check projects
  const projects = await db.collection("projects").limit(5).get();
  console.log(`\nTotal projects: ${projects.size}`);
  projects.docs.forEach(d => {
    console.log(`  - ${d.id}: ${d.data().name}`);
  });
}

check();