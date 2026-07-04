export class ServiceFactory {
  private static instances = new Map();

  static getService<T, A>(
    serviceClass: new (...args: A[]) => T,
    ...makers: A[]
  ): T {
    if (!ServiceFactory.instances.has(serviceClass)) {
      ServiceFactory.instances.set(serviceClass, new serviceClass(...makers));
    }
    return ServiceFactory.instances.get(serviceClass);
  }
}
