import Trap from "./Trap";
import Barrel from "../Barrel";
import { BarrelBase } from "../TankBody";
import { TankDefinition } from "../../../Const/TankDefinitions";
import { StyleFlags, Color, Stat } from "../../../Const/Enums";
import LivingEntity from "../../Live";
import { PhysicsFlags } from "../../../Const/Enums";
import { FrozenEffect } from "./Frozen";

/**
 * 冰冻陷阱类，可以减缓敌人移动速度的陷阱
 */
export default class FrozenTrap extends Trap {
    /** 减速比例 */
    private slowRatio: number;
    
    /** 减速持续时间 */
    private slowDuration: number;

    public constructor(barrel: Barrel, tank: BarrelBase, tankDefinition: TankDefinition | null, shootAngle: number) {
        super(barrel, tank, tankDefinition, shootAngle);
        
        const bulletDamage = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletDamage] || 0;
        const bulletHealth = tank.cameraEntity.cameraData?.values.statLevels.values[Stat.BulletPenetration] || 0;
        
        this.slowRatio = (barrel.definition.bullet.slowRatio || 0.5) * (1 + bulletDamage * 0);
        this.slowDuration = (barrel.definition.bullet.slowDuration || 20) * (1 + bulletHealth * 0);
        
        // 设置冰冻陷阱的颜色为浅蓝色
        this.styleData.values.color = Color.Frozen;
        this.styleData.values.flags |= StyleFlags.hasNoDmgIndicator;
    }

    public tick(tick: number): void {
        super.tick(tick);

        const collidedEntity = this.physicsData.values.flags & PhysicsFlags.onlySameOwnerCollision ? null : this.findCollisions()[0];
        if (collidedEntity instanceof LivingEntity && collidedEntity.healthData) {
            new FrozenEffect(collidedEntity, this.game.tick + this.slowDuration, this.slowRatio, this);
        }
    }
} 