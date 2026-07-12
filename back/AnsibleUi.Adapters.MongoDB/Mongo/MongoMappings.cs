using MongoDB.Bson;
using MongoDB.Bson.Serialization;
using MongoDB.Bson.Serialization.Conventions;
using MongoDB.Bson.Serialization.Serializers;

namespace AnsibleUi.Adapters.MongoDB.Mongo;

public static class MongoMappings
{
	private static bool _registered;

	public static void Register()
	{
		if (_registered)
			return;
		_registered = true;

		BsonSerializer.RegisterSerializer(new GuidSerializer(GuidRepresentation.Standard));

		var pack = new ConventionPack
		{
			new CamelCaseElementNameConvention(),
			new EnumRepresentationConvention(BsonType.String),
			new IgnoreExtraElementsConvention(true)
		};
		ConventionRegistry.Register("ansible-ui", pack, _ => true);
	}
}
