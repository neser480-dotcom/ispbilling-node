double _d(dynamic v) => v is num ? v.toDouble() : double.tryParse('${v ?? ''}') ?? 0;
int _i(dynamic v) => v is num ? v.toInt() : int.tryParse('${v ?? ''}') ?? 0;
String _s(dynamic v) => v == null ? '' : '$v';

class DashboardSummary {
  final double potential, collection, percent;
  final int totalCustomers, newCustomers;
  final int connectedCustomers, connectedNew, paidCustomers, paidNew;
  final double connectedAmount, connectedNewAmount, paidNewAmount;

  const DashboardSummary({
    required this.potential,
    required this.collection,
    required this.percent,
    required this.totalCustomers,
    required this.newCustomers,
    required this.connectedCustomers,
    required this.connectedNew,
    required this.paidCustomers,
    required this.paidNew,
    required this.connectedAmount,
    required this.connectedNewAmount,
    required this.paidNewAmount,
  });

  factory DashboardSummary.fromJson(Map<String, dynamic> j) => DashboardSummary(
        potential: _d(j['potential']),
        collection: _d(j['collection']),
        percent: _d(j['percent']),
        totalCustomers: _i(j['total_customers']),
        newCustomers: _i(j['new_customers']),
        connectedCustomers: _i(j['connected_customers']),
        connectedNew: _i(j['connected_new']),
        paidCustomers: _i(j['paid_customers']),
        paidNew: _i(j['paid_new']),
        connectedAmount: _d(j['connected_amount']),
        connectedNewAmount: _d(j['connected_new_amount']),
        paidNewAmount: _d(j['paid_new_amount']),
      );
}

class PersonItem {
  final String name;
  final double amount;
  final int count;

  const PersonItem({required this.name, required this.amount, required this.count});

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
