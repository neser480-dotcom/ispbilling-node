double _d(dynamic v) =>
    v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';

class DashboardSummary {
  final String type, role;
  final Map<String, dynamic> permissions;
  final bool hasCustomers,
      hasCollection,
      hasFinance,
      hasAdmin,
      hasCollector,
      hasMikrotik;
  final double potential, collection, percent, billAndFee, todayCollection;
  final int totalCustomers,
      newCustomers,
      connectedCustomers,
      connectedNew,
      paidCustomers,
      paidNew;
  final int unpaidCustomers, expiredCustomers, inactiveCustomers, freeCustomers;
  final int activeNew,
      unpaidNew,
      expiredNew,
      inactiveNew,
      paidCount,
      newPaidCount;
  final double connectedAmount, connectedNewAmount, paidNewAmount;
  final double activeAmount,
      paidAmount,
      unpaidAmount,
      expiredAmount,
      inactiveAmount;
  final double activeNewAmount,
      unpaidNewAmount,
      expiredNewAmount,
      inactiveNewAmount;
  final double connectionFee, todayConnectionFee, discount, todayDiscount;
  final double expenditure, todayExpenditure, salary, balance;
  final Map<String, dynamic>? admin, collector, mikrotik, superAdmin;

  const DashboardSummary({
    required this.type,
    required this.role,
    required this.permissions,
    required this.hasCustomers,
    required this.hasCollection,
    required this.hasFinance,
    required this.hasAdmin,
    required this.hasCollector,
    required this.hasMikrotik,
    required this.potential,
    required this.collection,
    required this.percent,
    required this.billAndFee,
    required this.todayCollection,
    required this.totalCustomers,
    required this.newCustomers,
    required this.connectedCustomers,
    required this.connectedNew,
    required this.paidCustomers,
    required this.paidNew,
    required this.unpaidCustomers,
    required this.expiredCustomers,
    required this.inactiveCustomers,
    required this.freeCustomers,
    required this.activeNew,
    required this.unpaidNew,
    required this.expiredNew,
    required this.inactiveNew,
    required this.paidCount,
    required this.newPaidCount,
    required this.connectedAmount,
    required this.connectedNewAmount,
    required this.paidNewAmount,
    required this.activeAmount,
    required this.paidAmount,
    required this.unpaidAmount,
    required this.expiredAmount,
    required this.inactiveAmount,
    required this.activeNewAmount,
    required this.unpaidNewAmount,
    required this.expiredNewAmount,
    required this.inactiveNewAmount,
    required this.connectionFee,
    required this.todayConnectionFee,
    required this.discount,
    required this.todayDiscount,
    required this.expenditure,
    required this.todayExpenditure,
    required this.salary,
    required this.balance,
    required this.admin,
    required this.collector,
    required this.mikrotik,
    required this.superAdmin,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) {
    Map<String, dynamic>? obj(dynamic v) =>
        v is Map ? Map<String, dynamic>.from(v) : null;
    return DashboardSummary(
      type: _s(j['type']),
      role: _s(j['role']),
      permissions: obj(j['permissions']) ?? {},
      hasCustomers: j['has_customers'] == true,
      hasCollection: j['has_collection'] == true,
      hasFinance: j['has_finance'] == true,
      hasAdmin: j['has_admin'] == true,
      hasCollector: j['has_collector'] == true,
      hasMikrotik: j['has_mikrotik'] == true,
      potential: _d(j['potential']),
      collection: _d(j['collection']),
      percent: _d(j['percent']),
      billAndFee: _d(j['bill_and_fee']),
      todayCollection: _d(j['today_collection']),
      totalCustomers: _i(j['total_customers']),
      newCustomers: _i(j['new_customers']),
      connectedCustomers: _i(j['connected_customers']),
      connectedNew: _i(j['connected_new']),
      paidCustomers: _i(j['paid_customers']),
      paidNew: _i(j['paid_new']),
      unpaidCustomers: _i(j['unpaid_customers']),
      expiredCustomers: _i(j['expired_customers']),
      inactiveCustomers: _i(j['inactive_customers']),
      freeCustomers: _i(j['free_customers']),
      activeNew: _i(j['active_new']),
      unpaidNew: _i(j['unpaid_new']),
      expiredNew: _i(j['expired_new']),
      inactiveNew: _i(j['inactive_new']),
      paidCount: _i(j['paid_count']),
      newPaidCount: _i(j['new_paid_count']),
      connectedAmount: _d(j['connected_amount']),
      connectedNewAmount: _d(j['connected_new_amount']),
      paidNewAmount: _d(j['paid_new_amount']),
      activeAmount: _d(j['active_amount']),
      paidAmount: _d(j['paid_amount']),
      unpaidAmount: _d(j['unpaid_amount']),
      expiredAmount: _d(j['expired_amount']),
      inactiveAmount: _d(j['inactive_amount']),
      activeNewAmount: _d(j['active_new_amount']),
      unpaidNewAmount: _d(j['unpaid_new_amount']),
      expiredNewAmount: _d(j['expired_new_amount']),
      inactiveNewAmount: _d(j['inactive_new_amount']),
      connectionFee: _d(j['connection_fee']),
      todayConnectionFee: _d(j['today_connection_fee']),
      discount: _d(j['discount']),
      todayDiscount: _d(j['today_discount']),
      expenditure: _d(j['expenditure']),
      todayExpenditure: _d(j['today_expenditure']),
      salary: _d(j['salary']),
      balance: _d(j['balance']),
      admin: obj(j['admin']),
      collector: obj(j['collector']),
      mikrotik: obj(j['mikrotik']),
      superAdmin: obj(j['super_admin']),
    );
  }
}

class PersonItem {
  final String name;
  final double amount;
  final int count;

  const PersonItem(
      {required this.name, required this.amount, required this.count});

  factory PersonItem.fromJson(Map<String, dynamic> j) => PersonItem(
        name: _s(j['name']),
        amount: _d(j['amount']),
        count: _i(j['count']),
      );
}

class PeopleData {
  final double balance;
  final List<PersonItem> items;

  const PeopleData({required this.balance, required this.items});

  factory PeopleData.fromJson(Map<String, dynamic> j) => PeopleData(
        balance: _d(j['balance']),
        items: ((j['items'] ?? []) as List)
            .map((e) => PersonItem.fromJson(Map<String, dynamic>.from(e)))
            .toList(),
      );
}

class SimpleOption {
  final String id, name;
  const SimpleOption({required this.id, required this.name});

  factory SimpleOption.fromJson(Map<String, dynamic> j) =>
      SimpleOption(id: _s(j['id']), name: _s(j['name']));
}

class AreaItem {
  final int id;
  final String name, subtitle, description;

  const AreaItem({
    required this.id,
    required this.name,
    required this.subtitle,
    required this.description,
  });

  factory AreaItem.fromJson(Map<String, dynamic> j) => AreaItem(
        id: _i(j['id']),
        name: _s(j['name']),
        subtitle: _s(j['subtitle']),
        description: _s(j['description']),
      );
}

class PackageItem {
  final int id;
  final String name, createdAt;
  final double price;

  const PackageItem({
    required this.id,
    required this.name,
    required this.createdAt,
    required this.price,
  });

  factory PackageItem.fromJson(Map<String, dynamic> j) => PackageItem(
        id: _i(j['id']),
        name: _s(j['name']),
        createdAt: _s(j['created_at']),
        price: _d(j['price']),
      );
}

class PackagesData {
  final int count;
  final List<PackageItem> items;

  const PackagesData({required this.count, required this.items});

  factory PackagesData.fromJson(Map<String, dynamic> j) {
    final items = ((j['items'] ?? []) as List)
        .map((e) => PackageItem.fromJson(Map<String, dynamic>.from(e)))
        .toList();
    return PackagesData(
      count: j['count'] == null ? items.length : _i(j['count']),
      items: items,
    );
  }
}
