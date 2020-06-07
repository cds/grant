
var t = require('assert')

var request = require('request-compose').extend({
  Request: {cookie: require('request-cookie').Request},
  Response: {cookie: require('request-cookie').Response},
}).client
var profile = require('grant-profile')

var Provider = require('../util/provider'), provider, oauth1
var Client = require('../util/client'), client


describe('handler', () => {
  var config

  before(async () => {
    provider = await Provider({flow: 'oauth2'})
    oauth1 = await Provider({flow: 'oauth1', port: 5002})
    config = {
      defaults: {
        origin: 'http://localhost:5001', callback: '/',
      },
      oauth2: {
        authorize_url: provider.url('/oauth2/authorize_url'),
        access_url: provider.url('/oauth2/access_url'),
        profile_url: provider.url('/oauth2/profile_url'),
        oauth: 2,
        dynamic: true,
      },
      oauth1: {
        request_url: oauth1.url('/oauth1/request_url'),
        authorize_url: oauth1.url('/oauth1/authorize_url'),
        access_url: oauth1.url('/oauth1/access_url'),
        profile_url: oauth1.url('/oauth1/profile_url'),
        oauth: 1,
        dynamic: true,
      }
    }
  })

  after(async () => {
    await provider.close()
    await oauth1.close()
  })

  describe('handlers', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'handlers', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
          })
        })
      })
    })
  })

  describe('handlers function', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'handlers-function', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
          })
        })
      })
    })
  })

  describe('missing session middleware', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'missing-session', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          try {
            var {body} = await request({
              url: client.url('/connect/oauth2'),
              cookie: {},
            })
            t.equal(body, 'Grant: mount session middleware first')
          }
          catch (err) {
            // hapi - assertion is in the client
          }
        })
      })
    })
  })

  describe('missing body-parser middleware', () => {
    ;['express', 'koa'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'missing-parser', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body} = await request({
            method: 'POST',
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.equal(body, 'Grant: mount body parser middleware first')
        })
      })
    })
  })

  describe('missing provider', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'handlers', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('/connect - misconfigured provider', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            qs: {oauth: 5},
            cookie: {},
          })
          t.deepEqual(response, {error: 'Grant: missing or misconfigured provider'})
        })

        it('/connect - missing provider', async () => {
          t.equal(config.defaults.dynamic, undefined)
          var {body: {response}} = await request({
            url: client.url('/connect/oauth5'),
            cookie: {},
          })
          t.deepEqual(response, {error: 'Grant: missing or misconfigured provider'})
        })

        it('/callback - missing session', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2/callback'),
            cookie: {},
          })
          t.deepEqual(response, {error: 'Grant: missing session or misconfigured provider'})
        })
      })
    })
  })

  describe('path matching regexp', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'handlers', handler, config: {
            defaults: {
              origin: 'http://localhost:5001', callback: '/',
            },
            oauth2: {
              authorize_url: provider.url('/oauth2/authorize_url'),
              access_url: provider.url('/oauth2/access_url'),
              oauth: 2,
              overrides: {override: {}},
            }
          }})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var paths = [
            '/connect/oauth2',
            '/connect/oauth2/override',
          ]
          var endings = [
            '',
            '/',
            '/?a=/',
            '?',
            '?a=/',
          ]
          for (var path of paths) {
            for (var end of endings) {
              if (
                'hapi' === handler &&
                '/connect/oauth2/override' === path &&
                ['/', '/?a=/'].includes(end)) {
                continue
              }
              var {body: {response}} = await request({
                url: client.url(path + end),
                cookie: {},
              })
              t.deepEqual(response, {
                access_token: 'token',
                refresh_token: 'refresh',
                raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
              })
            }
          }
          try {
            var {body: {response}} = await request({
              url: client.url('/connect/oauth2/override/something'),
              cookie: {},
            })
          }
          catch (err) {
            t.equal(err.message, '404 Not Found')
          }
        })
      })
    })
  })

  describe('path prefix', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      ;[
        {config: {path: '/oauth'},         connect: '/oauth/connect/oauth2'},
        {config: {prefix: '/oauth'},       connect: '/oauth/oauth2'},
        {config: {prefix: '/oauth/login'}, connect: '/oauth/login/oauth2'},
      ]
      .forEach((test) => {
        describe(`${handler} ${JSON.stringify(test.config)}`, () => {
          before(async () => {
            client = await Client({
              test: 'path-prefix',
              handler,
              config: {
                defaults: {...config.defaults, ...test.config},
                oauth2: config.oauth2
              }
            })
          })

          after(async () => {
            await client.close()
          })

          it('success', async () => {
            var {body: {response}} = await request({
              url: client.url(test.connect),
              cookie: {},
            })
            t.deepEqual(response, {
              access_token: 'token',
              refresh_token: 'refresh',
              raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
            })
          })
        })
      })
    })
  })

  describe('dynamic state', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'dynamic-state', handler, config})
        })

        after(async () => {
          await client.close()
        })

        afterEach(() => {
          provider.on.authorize = () => {}
          provider.on.access = () => {}
        })

        it('success', async () => {
          provider.on.authorize = ({query}) => {
            t.deepEqual(query, {
              client_id: 'very',
              response_type: 'code',
              redirect_uri: 'http://localhost:5001/connect/oauth2/callback'
            })
          }
          provider.on.access = ({form}) => {
            t.deepEqual(form, {
              grant_type: 'authorization_code',
              code: 'code',
              client_id: 'very',
              client_secret: 'secret',
              redirect_uri: 'http://localhost:5001/connect/oauth2/callback'
            })
          }
          var {body: {response, session}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
          })
          t.deepEqual(session, {provider: 'oauth2'})
        })
      })
    })
  })

  describe('transport querystring session', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      ;['', 'querystring', 'session'].forEach((transport) => {
        describe(`${handler} - transport ${transport}`, () => {
          before(async () => {
            client = await Client({test: 'handlers', handler, config})
          })

          after(async () => {
            await client.close()
          })

          it('success', async () => {
            var {body: {response, session, state}} = await request({
              url: client.url('/connect/oauth2'),
              qs: {transport},
              cookie: {},
            })
            t.deepEqual(response, {
              access_token: 'token',
              refresh_token: 'refresh',
              raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
            })
            if (/^(|querystring)$/.test(transport)) {
              t.deepEqual(session, {provider: 'oauth2', dynamic: {transport}})
            }
            else if (/session/.test(transport)) {
              t.deepEqual(session, {provider: 'oauth2', dynamic: {transport}, response: {
                access_token: 'token',
                refresh_token: 'refresh',
                raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
              }})
            }
          })
        })
      })
    })
  })

  describe('transport state', () => {
    ;['express', 'koa', 'koa-before', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'transport-state', handler, config: {
            defaults: {...config.defaults, transport: 'state'},
            oauth2: config.oauth2
          }})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response, session, state}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
          })
          t.deepEqual(session, {provider: 'oauth2'})
          t.deepEqual(state, {
            response: {
              access_token: 'token',
              refresh_token: 'refresh',
              raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
            }
          })
        })
      })
    })
  })

  describe('response filter', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      ;['token', ['tokens'], ['raw'], ['jwt'], ['profile'], ['raw', 'jwt'],
        ['tokens', 'raw', 'jwt', 'profile']].forEach((response) => {
        describe(`${handler} - ${JSON.stringify(response)}`, () => {
          before(async () => {
            var extend = [profile]
            client = await Client({test: 'handlers', handler, config, extend})
          })

          after(async () => {
            await client.close()
          })

          it('success', async () => {
            var {body} = await request({
              url: client.url('/connect/oauth2'),
              qs: {scope: ['openid'], response},
              cookie: {},
            })
            t.deepEqual(
              body.response,
              {
                token: {
                  id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature',
                  access_token: 'token',
                  refresh_token: 'refresh'
                },
                tokens: {
                  id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature',
                  access_token: 'token',
                  refresh_token: 'refresh'
                },
                raw: {
                  raw: {
                    access_token: 'token',
                    refresh_token: 'refresh',
                    expires_in: '3600',
                    id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature'
                  }
                },
                jwt: {
                  jwt: {
                    id_token: {
                      header: {typ: 'JWT'},
                      payload: {nonce: 'whatever'},
                      signature: 'signature'
                    }
                  }
                },
                profile: {
                  profile: {user: 'simov'}
                },
                'raw,jwt': {
                  raw: {
                    access_token: 'token',
                    refresh_token: 'refresh',
                    expires_in: '3600',
                    id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature'
                  },
                  jwt: {
                    id_token: {
                      header: {typ: 'JWT'},
                      payload: {nonce: 'whatever'},
                      signature: 'signature'
                    }
                  }
                },
                'tokens,raw,jwt,profile': {
                  id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature',
                  access_token: 'token',
                  refresh_token: 'refresh',
                  raw: {
                    access_token: 'token',
                    refresh_token: 'refresh',
                    expires_in: '3600',
                    id_token: 'eyJ0eXAiOiJKV1QifQ.eyJub25jZSI6IndoYXRldmVyIn0.signature'
                  },
                  jwt: {
                    id_token: {
                      header: {typ: 'JWT'},
                      payload: {nonce: 'whatever'},
                      signature: 'signature'
                    }
                  },
                  profile: {user: 'simov'}
                }
              }[[].concat(response).join()]
            )
          })
        })
      })
    })
  })

  describe('third-party middlewares', () => {
    ;['koa-mount', 'express-cookie'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          client = await Client({test: 'third-party', handler, config})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'}
          })
        })
      })
    })
  })

  describe('extend + hook', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          var state = {grant: 'simov'}
          var hook = ({get, set}) =>
            get ? Promise.resolve(state[get]) :
            set ? (state[set.id] = set.value, Promise.resolve()) :
            Promise.resolve()
          var extend = [
            ({hook}) => async ({provider, input, output}) => {
              output.profile = await hook({get: 'grant'})
              await hook({set: {id: 'grant', value: 'purest'}})
              t.deepEqual(state, {grant: 'purest'})
              return {provider, input, output}
            }
          ]
          client = await Client({test: 'extend-hook', handler, config, hook, extend})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'},
            profile: 'simov'
          })
        })
      })
    })
  })

  describe('request options', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        var calls = []

        before(async () => {
          var agent = new require('http').Agent()
          agent.createConnection = ((orig) => (...args) => {
            var {method, headers} = args[0]
            calls.push({method, headers})
            return orig(...args)
          })(agent.createConnection)
          client = await Client({test: 'handlers', handler, config, request: {agent}})
        })

        after(async () => {
          await client.close()
        })

        afterEach(() => calls = [])

        it('oauth2', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            qs: {response: ['tokens', 'raw', 'profile']},
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'},
            profile: {user: 'simov'}
          })
          var {method, headers} = calls[0]
          t.equal(method, 'POST')
          t.equal(headers['content-type'], 'application/x-www-form-urlencoded')
          t.ok(/^simov\/grant/.test(headers['user-agent']))
          var {method, headers} = calls[1]
          t.equal(method, 'GET')
          t.equal(headers.authorization, 'Bearer token')
          t.ok(/^simov\/grant/.test(headers['user-agent']))
        })

        it('oauth1', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth1'),
            qs: {response: ['tokens', 'raw', 'profile']},
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            access_secret: 'secret',
            raw: {oauth_token: 'token', oauth_token_secret: 'secret'},
            profile: {user: 'simov'}
          })
          var {method, headers} = calls[0]
          t.equal(method, 'POST')
          t.ok(/oauth_callback/.test(headers.Authorization))
          t.ok(/^simov\/grant/.test(headers['user-agent']))
          var {method, headers} = calls[1]
          t.equal(method, 'POST')
          t.ok(/oauth_verifier/.test(headers.Authorization))
          t.ok(/^simov\/grant/.test(headers['user-agent']))
          var {method, headers} = calls[2]
          t.equal(method, 'GET')
          t.ok(/oauth_token/.test(headers.Authorization))
          t.ok(/^simov\/grant/.test(headers['user-agent']))
        })
      })
    })
  })

  describe('profile', () => {
    ;['express', 'koa', 'hapi'].forEach((handler) => {
      describe(handler, () => {
        before(async () => {
          var extend = [profile]
          client = await Client({test: 'handlers', handler, config, extend})
        })

        after(async () => {
          await client.close()
        })

        it('success', async () => {
          var {body: {response}} = await request({
            url: client.url('/connect/oauth2'),
            cookie: {},
          })
          t.deepEqual(response, {
            access_token: 'token',
            refresh_token: 'refresh',
            raw: {access_token: 'token', refresh_token: 'refresh', expires_in: '3600'},
            profile: {user: 'simov'}
          })
        })
      })
    })
  })
})
