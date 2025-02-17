import Nylas from '../src/nylas';
import NylasConnection from '../src/nylas-connection';
import File from '../src/models/file';
import Message from '../src/models/message';
import { Label } from '../src/models/folder';
import MessageRestfulModelCollection from '../src/models/message-restful-model-collection';
import fetch from 'node-fetch';
import EmailParticipant from '../src/models/email-participant';

jest.mock('node-fetch', () => {
  const { Request, Response } = jest.requireActual('node-fetch');
  const fetch = jest.fn();
  fetch.Request = Request;
  fetch.Response = Response;
  return fetch;
});

describe('Message', () => {
  let testContext;

  beforeEach(() => {
    Nylas.config({
      clientId: 'myClientId',
      clientSecret: 'myClientSecret',
      apiServer: 'https://api.nylas.com',
    });
    testContext = {};
    testContext.connection = new NylasConnection('123', { clientId: 'foo' });
    jest.spyOn(testContext.connection, 'request');

    const response = receivedBody => {
      return {
        status: 200,
        buffer: () => {
          return Promise.resolve('body');
        },
        json: () => {
          // For the raw/MIME flow
          if (receivedBody === null) {
            return Promise.resolve('MIME');
          }
          return Promise.resolve(receivedBody);
        },
        headers: new Map(),
      };
    };

    fetch.mockImplementation(req => Promise.resolve(response(req.body)));

    testContext.message = new Message(testContext.connection);
    testContext.message.id = '4333';
    testContext.message.subject = 'foo';
    testContext.message.body = 'bar';
    testContext.message.starred = true;
    testContext.message.unread = false;
    testContext.message.to = [
      new EmailParticipant({ email: 'foo', name: 'bar' }),
    ];
  });

  describe('save', () => {
    test('should do a PUT request with labels if labels is defined. Additional arguments should be ignored.', done => {
      const label = new Label(testContext.connection);
      label.id = 'label_id';
      testContext.message.labels = [label];
      testContext.message.randomArgument = true;
      return testContext.message.save().then(() => {
        const options = testContext.connection.request.mock.calls[0][0];
        expect(options.url.toString()).toEqual(
          'https://api.nylas.com/messages/4333'
        );
        expect(options.method).toEqual('PUT');
        expect(JSON.parse(options.body)).toEqual({
          label_ids: ['label_id'],
          starred: true,
          unread: false,
        });
        done();
      });
    });

    test('should do a PUT with folder if folder is defined', done => {
      const label = new Label(testContext.connection);
      label.id = 'label_id';
      testContext.message.folder = label;
      return testContext.message.save().then(() => {
        const options = testContext.connection.request.mock.calls[0][0];
        expect(options.url.toString()).toEqual(
          'https://api.nylas.com/messages/4333'
        );
        expect(options.method).toEqual('PUT');
        expect(JSON.parse(options.body)).toEqual({
          folder_id: 'label_id',
          starred: true,
          unread: false,
        });
        done();
      });
    });

    test('should do a PUT with metadata if metadata is defined', done => {
      testContext.message.metadata = {
        test: 'yes',
      };
      return testContext.message.save().then(() => {
        const options = testContext.connection.request.mock.calls[0][0];
        expect(options.url.toString()).toEqual(
          'https://api.nylas.com/messages/4333'
        );
        expect(options.method).toEqual('PUT');
        expect(JSON.parse(options.body)).toEqual({
          metadata: {
            test: 'yes',
          },
          starred: true,
          unread: false,
        });
        done();
      });
    });

    test('should resolve with the message object', done => {
      return testContext.message.save().then(message => {
        expect(message.id).toBe('4333');
        expect(message.body).toBe('bar');
        expect(message.subject).toBe('foo');
        const toParticipant = message.to[0];
        expect(toParticipant).toEqual({ email: 'foo', name: 'bar' });
        done();
      });
    });
  });

  describe('getRaw', () => {
    test('should support getting raw messages', done => {
      return testContext.message.getRaw().then(rawMessage => {
        const options = testContext.connection.request.mock.calls[0][0];
        expect(options.url.toString()).toEqual(
          'https://api.nylas.com/messages/4333'
        );
        expect(options.method).toEqual('GET');
        expect(options.headers['message/rfc822']).toEqual();
        expect(rawMessage).toBe('MIME');
        done();
      });
    });
  });

  describe('MessageRestfulModelCollection', () => {
    beforeEach(() => {
      const secondMessage = new Message(testContext.connection);
      secondMessage.id = '5333';
      secondMessage.subject = 'subject2';
      secondMessage.body = 'body';
      secondMessage.unread = false;
      secondMessage.to = [new EmailParticipant({ email: 'foo', name: 'bar' })];

      const response = request => {
        return {
          status: 200,
          buffer: () => {
            return Promise.resolve('body');
          },
          json: () => {
            // For the raw/MIME flow
            if (request.headers.get('Accept') === 'message/rfc822') {
              return Promise.resolve('MIME');
            }
            return Promise.resolve([
              testContext.message.toJSON(false),
              secondMessage.toJSON(false),
            ]);
          },
          headers: new Map(),
        };
      };

      fetch.mockImplementation(req => Promise.resolve(response(req)));

      testContext.collection = new MessageRestfulModelCollection(
        testContext.connection
      );
      testContext.collection.getModelCollection = jest.fn(() => {
        return Promise.resolve([testContext.message]);
      });
    });

    test('first should resolve with the first item', done => {
      const fileObj = {
        account_id: 'foo',
        content_disposition: 'inline',
        content_id: 'bar',
        content_type: 'image/png',
        filename: 'foobar.png',
        id: 'file_id',
        object: 'file',
        message_ids: [],
        size: 123,
      };
      const file = new File(testContext.connection);
      file.fromJSON(fileObj);
      testContext.message.files = [file];
      return testContext.collection.first().then(message => {
        expect(message instanceof Message).toBe(true);
        expect(message).toBe(testContext.message);
        const file = message.files[0];
        expect(file.toJSON()).toEqual(fileObj);
        expect(file.contentDisposition).toEqual(fileObj.content_disposition);
        done();
      });
    });

    test('should return multiple messages', done => {
      return testContext.connection.messages
        .findMultiple(['4333', '5333'])
        .then(messages => {
          const options = testContext.connection.request.mock.calls[0][0];
          expect(options.path.toString()).toEqual(`/messages/4333,5333`);
          expect(options.method).toEqual('GET');
          expect(options.qs).toEqual({
            offset: 0,
            limit: 100,
          });
          expect(messages.length).toBe(2);
          expect(messages[0] instanceof Message).toBe(true);
          expect(messages[1] instanceof Message).toBe(true);
          expect(messages[0].id).toBe('4333');
          expect(messages[0].subject).toBe('foo');
          expect(messages[0].body).toBe('bar');
          expect(messages[1].id).toBe('5333');
          expect(messages[1].subject).toBe('subject2');
          expect(messages[1].body).toBe('body');
          done();
        });
    });

    test('should support getting raw messages', done => {
      return testContext.collection.findRaw('abc-123').then(rawMessage => {
        const options = testContext.connection.request.mock.calls[0][0];
        expect(options.path.toString()).toEqual('/messages/abc-123');
        expect(options.method).toEqual('GET');
        expect(options.headers['Accept']).toEqual('message/rfc822');
        expect(rawMessage).toBe('MIME');
        done();
      });
    });
  });
});
