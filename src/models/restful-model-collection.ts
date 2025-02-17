import Message from './message';
import NylasConnection from '../nylas-connection';
import RestfulModel from './restful-model';
import Thread from './thread';
import ModelCollection from './model-collection';

export type GetCallback = (error: Error | null, result?: RestfulModel) => void;

export default class RestfulModelCollection<
  T extends RestfulModel
> extends ModelCollection<any> {
  modelClass: typeof RestfulModel;
  baseUrl?: string;

  constructor(modelClass: typeof RestfulModel, connection: NylasConnection) {
    super(modelClass, connection, modelClass.collectionName);
    this.modelClass = modelClass;
    this._path = `/${this.modelClass.collectionName}`;
  }

  count(
    params: Record<string, unknown> = {},
    callback?: (err: Error | null, num?: number) => void
  ): Promise<number> {
    return this.connection
      .request({
        method: 'GET',
        path: this.path(),
        qs: { view: 'count', ...params },
        baseUrl: this.baseUrl,
      })
      .then((json: any) => {
        if (callback) {
          callback(null, json.count);
        }
        return Promise.resolve(json.count);
      })
      .catch((err: Error) => {
        if (callback) {
          callback(err);
        }
        return Promise.reject(err);
      });
  }

  first(
    params: Record<string, unknown> = {},
    callback?: (error: Error | null, model?: T) => void
  ): Promise<T> {
    if (params.view == 'count') {
      const err = new Error('first() cannot be called with the count view');
      if (callback) {
        callback(err);
      }
      return Promise.reject(err);
    }

    return this.getItems(params, 0, 1)
      .then(items => {
        if (callback) {
          callback(null, items[0]);
        }
        return Promise.resolve(items[0]);
      })
      .catch(err => {
        if (callback) {
          callback(err);
        }
        return Promise.reject(err);
      });
  }

  search(
    query: string,
    params: Record<string, unknown> = {},
    callback?: (error: Error | null) => void
  ): Promise<T[]> {
    if (this.modelClass != Message && this.modelClass != Thread) {
      const err = new Error(
        'search() can only be called for messages and threads'
      );
      if (callback) {
        callback(err);
      }
      return Promise.reject(err);
    }

    if (!query) {
      const err = new Error('search() requires a query string');
      if (callback) {
        callback(err);
      }
      return Promise.reject(err);
    }

    params.q = query;
    const limit = (params.limit as number) || 40;
    const offset = params.offset as number;
    const path = `${this.path()}/search`;

    return this.range({ params, offset, limit, path });
  }

  delete(
    itemOrId: T | string,
    params: Record<string, unknown> = {},
    callback?: (error: Error | null) => void
  ): any {
    if (!itemOrId) {
      const err = new Error('delete() requires an item or an id');
      if (callback) {
        callback(err);
      }
      return Promise.reject(err);
    }

    if (typeof params === 'function') {
      callback = params as (error: Error | null) => void;
      params = {};
    }

    const item =
      typeof itemOrId === 'string' ? this.build({ id: itemOrId }) : itemOrId;

    const options: Record<string, any> = item.deleteRequestOptions(params);
    options.item = item;

    return this.deleteItem(options, callback);
  }

  deleteItem(
    options: Record<string, any>,
    callbackArg?: (error: Error | null) => void
  ): any {
    const item = options.item;
    // callback used to be in the options object
    const callback = options.callback ? options.callback : callbackArg;
    const body = options.hasOwnProperty('body')
      ? options.body
      : item.deleteRequestBody({});
    const qs = options.hasOwnProperty('qs')
      ? options.qs
      : item.deleteRequestQueryString({});

    return this.connection
      .request({
        method: 'DELETE',
        qs: qs,
        body: body,
        path: `${this.path()}/${item.id}`,
        baseUrl: this.baseUrl,
      })
      .then(data => {
        if (callback) {
          callback(null, data);
        }
        return Promise.resolve(data);
      })
      .catch((err: Error) => {
        if (callback) {
          callback(err);
        }
        return Promise.reject(err);
      });
  }

  protected build(args: Record<string, unknown>): T {
    const model = this.createModel({});
    for (const key in args) {
      (model as any)[key] = args[key];
    }
    return model;
  }

  protected createModel(json: Record<string, unknown>): T {
    return new this.modelClass(this.connection).fromJSON(json) as T;
  }
}
