# Native MongoDB validation

Use a disposable local MongoDB 8 replica set. These commands require Docker and a free local port 27028:

```bash
docker run -d --name na-mongodb-tests -p 127.0.0.1:27028:27017 \
  mongo:8.0 --replSet rs0 --bind_ip_all
docker exec na-mongodb-tests mongosh --quiet --eval \
  'rs.initiate({_id:"rs0",members:[{_id:0,host:"localhost:27017"}]})'
```

Wait for replica-set election, then run from the repository root:

```bash
export MONGODB_TEST_URI='mongodb://127.0.0.1:27028/?replicaSet=rs0&directConnection=true'
npm run test:mongo
npm run build
npm run test:e2e
```

Only the test processes receive this URI; do not set `MONGODB_URI` for these commands. Test databases use random `na_test_` / `na_browser_test_` names and are dropped after the tests. Browser teardown explicitly removes its database. A forcibly killed test may leave an isolated test database behind; remove this disposable container when finished. Never use a production cluster for tests.

```bash
docker rm -f -v na-mongodb-tests
unset MONGODB_TEST_URI
```

The replica set has no authentication or TLS and binds only to local loopback. It is solely a test fixture; production requires verified TLS and secret-sourced credentials. Google Secret Manager tests use controlled responses to verify checksums and redaction. A live Secret Manager/Atlas connection is a separate deployment check requiring Google authentication, a saved secret, Atlas permissions and network access.
